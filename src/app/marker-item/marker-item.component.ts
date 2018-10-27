import { Component, EventEmitter, OnInit, OnChanges, Input, Output, SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';

import { MappiMarker } from '../providers/mappi/mappi.service';
import { MockDataService, IPhoto, IMarker } from '../providers/mock-data.service';
import { PhotoLibraryHelper, IThumbSrc } from '../providers/photo/photo.service';
import { ImgSrc, IImgSrc } from '../providers/photo/imgsrc.service';



@Component({
  selector: 'app-marker-item',
  templateUrl: './marker-item.component.html',
  styleUrls: ['./marker-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerItemComponent implements OnInit , OnChanges {

  public layout: string;  // enum=['gallery', 'edit']

  // PARENT Subject/Observable
  public miSubject: BehaviorSubject<IPhoto> = new BehaviorSubject<IPhoto>(null);
  public photo$: Observable<IPhoto> = this.miSubject.asObservable();
  private stash:any = {};

  @Input() mi: IPhoto;
  @Input() dim: string;
  @Input() parentLayout: string;  // enum=[gallery, list, edit, focus-marker-group]  
  @Output() miChange: EventEmitter<{data:IPhoto, action:string}> = new EventEmitter<{data:IPhoto, action:string}>();

  constructor(
    public dataService: MockDataService,
    private cd: ChangeDetectorRef,
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

          // wait for async fetch DataURL, uses async pipe subscription in view
          if (!this.mi._thumbSrc$){
            this.mi._thumbSrc$ = ImgSrc.getImgSrc$(this.mi, this.dim);
          }

          this.miSubject.next(this.mi);
          break;
        case 'dim':
          if (this.dim && this.mi ){
            this.mi._thumbSrc$ = ImgSrc.getImgSrc$(this.mi, this.dim);
          }
          break;
        case 'parentLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.mgLayoutChanged()
          break;
      }
    });
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
