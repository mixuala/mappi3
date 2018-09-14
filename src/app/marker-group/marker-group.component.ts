import { Component, EventEmitter, OnInit, OnChanges, Input, Output, 
  Host, HostBinding, Optional, SimpleChange,
} from '@angular/core';


import { MockDataService, IMarkerGroup, IPhoto } from '../providers/mock-data.service';
import { MarkerGroupFocusDirective } from './marker-group-focus.directive';
import { quickUuid } from '../providers/mappi/mappi.service';


@Component({
  selector: 'app-marker-group',
  templateUrl: './marker-group.component.html',
  styleUrls: ['./marker-group.component.scss'],
})
export class MarkerGroupComponent implements OnInit , OnChanges {

  // edit: boolean = false;
  // layout of wiwMarkerGroup= [gallery, list, edit, focus-marker-group]  
  public mgLayout: string;

  @Input() marker: IMarkerGroup;
  @Input() mListLayout: string;  // enum=['edit', 'default']

  @Input() mgFocus: IMarkerGroup;

  @Output() mgRemove: EventEmitter<IMarkerGroup> = new EventEmitter<IMarkerGroup>();
  @Output() mgFocusChange: EventEmitter<IMarkerGroup> = new EventEmitter<IMarkerGroup>();
  @Output() mgChange: EventEmitter<{mg:IMarkerGroup, change:string}> = new EventEmitter<{mg:IMarkerGroup, change:string}>();

  constructor(
    @Host() @Optional() private mgFocusBlur: MarkerGroupFocusDirective,
    public markerService: MockDataService,
  ) { }

  ngOnInit() {
    this.mgLayout = this.mgLayout || 'gallery';
    // this.mgLayout = 'focus-marker-group';
    // this.mgLayout = 'list'
    console.log("MarkerGroupComponent.ngOnInit(): mglayout=", this.mgLayout)
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;
      switch(k){
        case 'marker':
          if (change.firstChange===true) break;
          console.log("marker, id=",change.currentValue["label"])
          break;
        case 'mListLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.mListLayoutChanged()
          break;
        case 'mgFocus':
          if (!this.mgFocusBlur) break;
          const focus = change.currentValue;
          const hide = focus && this.marker.id != focus.id || false
          // console.log(`** mgFocusChange: ${this.marker.label} hideen=${hide}`)
          this.mgFocusBlur.blur(hide)
          break;
      }
    });
  }

  mListLayoutChanged(){
    // propagate layout change to MarkerGroupComponent (child)
    if (this.mListLayout == "edit") {
      self["_stash_mgLayout"] = this.mgLayout;
      this.mgLayout = "edit";
    }
    else this.mgLayout = this["_stash_mgLayout"];
  }

  createMarkerItem(ev:any, mg:IMarkerGroup){
    // create placeholder mi data
    const offset = [Math.random(), Math.random()].map(v=>(v-0.5)/60)
    return this.markerService.getPhotos()
    .then( res=>{
      const random = Math.floor(Math.random() * Math.floor(res.length))
      const p = Object.assign( {}, res[random], {
        id: Date.now(),
        uuid: quickUuid(),
      });
      this.markerService.inflatePhoto(p, mg.markerItemIds.length)
      p.loc = [ p.loc[0]+offset[0], p.loc[1]+offset[1] ];
      mg.markerItemIds.push( p.id );
      mg.markerItems.push( p );
      // this.markerService.saveMarkerItem(p);
      this.mgChange.emit({mg,change:"markerItem"} );
      return mg;
    })
  }

  removeMarkerItem(mi:IPhoto, mg:IMarkerGroup) {
    // TODO: call REST api: this.marker.markerItems.remove(o.id)
    mg.markerItems = mg.markerItems.filter( o=> o.id!=mi.id)

  }


  removeMarkerGroup(o:IMarkerGroup){
    this.debug("removeMarkerGroup(): id=", o.label);

    // remove item from HomePage.markers 
    // without losing current mg/mi view state
    this.mgRemove.emit( o );

  }

  // BUG: after reorder, <ion-item-options> is missing from dropped item
  reorderMarkerItem(ev, marker:IMarkerGroup){
    // TODO: call REST api: to update mi.seq
    const {from, to} = ev.detail;
    const changed = [];
    marker.markerItems.sort( (a,b)=>a.seq-b.seq )
    marker.markerItems.forEach( (o,i,l)=>{
      if (i < Math.min(from, to) || i > Math.max(from, to)) {
        if (o.seq != i) {
          console.warn("sequence error", `index:${i} , seq:${o.seq}`);
          o.seq = i;
          return;
        }
      }
      if (i == from ){
        o.seq = Math.min(to, l.length-1);
      } 
      else i < from ? o.seq++ : o.seq--;
      changed.push({id:o.dateTaken, seq:o.seq});
    })
    marker.markerItems.sort( (a,b)=>a.seq-b.seq )
    this.debug( "update marker.markerItems DB", changed )
  }

  toggleEditMode() {
    // this.edit = !this.edit;
    if (this.mgLayout != "focus-marker-group") {
      this["_stash_mgLayout"] = this.mgLayout;
      this.mgLayout = "focus-marker-group";

      // hide all MarkerGroupComponents that are not in layout="focus-marker-group" mode
      this.mgFocusChange.emit( this.marker )      
    }
    else {
      this.mgLayout = this["_stash_mgLayout"];
      this.mgFocusChange.emit( null )
    }
    console.log(`MarkerGroupComponent: ${this.marker.label},  mgLayout=${this.mgLayout} `)
  }

  // DEV Helpers

  // serialize
  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
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

