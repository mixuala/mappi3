import { Component, EventEmitter, OnInit, Input, Output } from '@angular/core';


import { IMarkerGroup, IPhoto } from '../providers/mock-data.service';


@Component({
  selector: 'app-marker-item',
  templateUrl: './marker-item.component.html',
  styleUrls: ['./marker-item.component.scss']
})
export class MarkerItemComponent implements OnInit {

  public miLayout: string;  // enum=['gallery', 'edit']

  @Input() photo: IPhoto;
  @Input() mgLayout: string;  // enum=[gallery, list, edit, focus-marker-group]  

  @Output() miRemove: EventEmitter<IPhoto> = new EventEmitter<IPhoto>();

  constructor() { }

  ngOnInit() {
    this.miLayout = this.miLayout || 'gallery';
    // this.miLayout = "list";
  }


  ngOnChanges(o){
    const self = this;
    Object.entries(o).forEach( en=>{
      let [k,change] = en;
      switch(k){
        case 'photo':
          // console.log("marker, id=",change["currentValue"]["label"])
          break;
        case 'mgLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.mgLayoutChanged()
          break;
        case 'miFocus':
          const focus = change["currentValue"];
          const hide = focus && this.photo.id != focus.id || false
          // console.log(`** miFocusChange: ${this.photo.dateTaken} hideen=${hide}`)
          // this.miFocusNode.blur(hide)
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
    this.debug("removeMarkerItem(): id=", o.dateTaken);

    // remove item from marker.markerItemss 
    this.miRemove.emit( o );
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
