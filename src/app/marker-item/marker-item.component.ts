import { Component, EventEmitter, OnInit, OnChanges, Input, Output, SimpleChange} from '@angular/core';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';

import { MockDataService, IPhoto } from '../providers/mock-data.service';



@Component({
  selector: 'app-marker-item',
  templateUrl: './marker-item.component.html',
  styleUrls: ['./marker-item.component.scss']
})
export class MarkerItemComponent implements OnInit , OnChanges {

  public miLayout: string;  // enum=['gallery', 'edit']

  // PARENT Subject/Observable
  public miSubject: BehaviorSubject<IPhoto> = new BehaviorSubject<IPhoto>(null);
  public photo$: Observable<IPhoto> = this.miSubject.asObservable();

  @Input() mi: IPhoto;
  @Input() mgLayout: string;  // enum=[gallery, list, edit, focus-marker-group]  

  @Output() miChange: EventEmitter<{data:IPhoto, action:string}> = new EventEmitter<{data:IPhoto, action:string}>();

  constructor(
    public dataService: MockDataService,
  ) { }

  ngOnInit() {
    this.miLayout = this.miLayout || 'gallery';
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k,change] = en;
      switch(k){
        case 'mi':
          if (!change.currentValue) return;
          const mi = change.currentValue;
          this.miSubject.next(mi);
          break;
        case 'mgLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.mgLayoutChanged()
          break;
      }
    });
  }  
  
  mgLayoutChanged(){
    // propagate layout change to MarkerItemComponent (child)
    if (['edit', 'focus-marker-group'].includes(this.mgLayout)) {
      self["_stash_miLayout"] = this.miLayout;
      this.miLayout = "edit";
    }
    else this.miLayout = this["_stash_miLayout"];
  }

  removeMarkerItem(o:IPhoto){
    this.debug("removeMarkerItem(): id=", o.dateTaken, o.uuid);
    this.miChange.emit( {data:o, action:'remove'} );
  }

  // DEV Helpers

  // serialize

  private obj2String(o) {
    let kv = Object.entries(o).reduce( (res,v)=> {res.push(v.join(':')); return res} ,[])
    return `{ ${kv.join(', ')} }`
  }
  private asPosition(p:IPhoto):Object{
    return {
      lat: Math.round(p.loc[0]*1e6)/1e6,
      lng: Math.round(p.loc[1]*1e6)/1e6,
    }
  }
  private asLocalTime(p:IPhoto):Date {
    let getTzOffset = function(loc:[number,number]):number {
      // get timezone offset from location
      // let offset = res.dstOffset + res.rawOffset;
      return -3600;
    }
    let offset = getTzOffset(p.loc);
    let d = new Date(p.dateTaken);
    d.setTime( d.getTime() + offset*1000 );
    return d;
  }

  private debug(...msg) {
    console.log(msg)
  }


}
