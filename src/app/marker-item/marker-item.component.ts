import { Component, EventEmitter, OnInit, OnChanges, Input, Output, SimpleChange} from '@angular/core';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';

import { MappiMarker } from '../providers/mappi/mappi.service';
import { MockDataService, IPhoto, IMarker } from '../providers/mock-data.service';
import { PhotoLibraryHelper } from '../providers/photo/photo.service';



@Component({
  selector: 'app-marker-item',
  templateUrl: './marker-item.component.html',
  styleUrls: ['./marker-item.component.scss']
})
export class MarkerItemComponent implements OnInit , OnChanges {

  public layout: string;  // enum=['gallery', 'edit']

  // PARENT Subject/Observable
  public miSubject: BehaviorSubject<IPhoto> = new BehaviorSubject<IPhoto>(null);
  public photo$: Observable<IPhoto> = this.miSubject.asObservable();
  private stash:any = {};

  @Input() mi: IPhoto;
  @Input() parentLayout: string;  // enum=[gallery, list, edit, focus-marker-group]  
  @Output() miChange: EventEmitter<{data:IPhoto, action:string}> = new EventEmitter<{data:IPhoto, action:string}>();

  constructor(
    public dataService: MockDataService,
  ) { }

  ngOnInit() {
    this.layout = this.layout || 'gallery';
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k,change] = en;
      switch(k){
        case 'mi':
          if (!change.currentValue) return;
          const mi = change.currentValue;
          this.setThumbSrc(mi); 
          this.miSubject.next(mi);
          break;
        case 'parentLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.mgLayoutChanged()
          break;
      }
    });
  }

  /**
   * // used by view with safe navigation operator, (?) so mutation ok
   * @param mi 
   * @param thumbDim 
   */
  setThumbSrc(mi:IPhoto, thumbDim:string='80x80'){
    const [imgW, imgH] = thumbDim.split('x');
    if (mi._thumbSrc && mi._imgCache && mi._imgCache[thumbDim] ){
      mi._thumbSrc.src = mi._imgCache[thumbDim];
      return;
    }
    mi._imgCache = mi._imgCache || {};
    if (!mi._imgCache[thumbDim] ) {
      // demo data only, src = "https://picsum.photos/80?image=24"
      mi._imgCache[thumbDim] = mi.src.replace(/\d+\/\d+/,'80');
    }
    mi._thumbSrc = {
      width: parseInt(imgW),
      height: parseInt(imgH),
      src: mi._imgCache[thumbDim],
      style:  {'width.px':imgW, 'height.px':imgH},
    }
    mi._thumbSrc$ = PhotoLibraryHelper.getThumbSrc$(mi, thumbDim);
  }
  
  mgLayoutChanged(){
    // propagate layout change to MarkerItemComponent (child)
    if (['edit', 'focus-marker-group'].includes(this.parentLayout)) {
      self["_stash_miLayout"] = this.layout;
      this.layout = "edit";
    }
    else this.layout = this["_stash_miLayout"];
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
  private asPositionLabel = MappiMarker.asPositionLabel;

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
