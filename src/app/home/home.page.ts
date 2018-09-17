import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
} from '@angular/core';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';
import  { MockDataService, quickUuid,
  IMarkerGroup,  IPhoto,
} from '../providers/mock-data.service';
import { promise } from 'protractor';
import { MappiMarker } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {

  // layout of markerList > markerGroups > markerItems: [edit, default]
  layout: string;
  markers: IMarkerGroup[] = [];
  
  // mgFocus Getter/Setter
  _mgFocus: IMarkerGroup;
  get mgFocus() {
    return this._mgFocus;
  }
  set mgFocus(value: IMarkerGroup) {
    this._mgFocus = value;
    if (value) {
      console.log("HomePage.mgFocus: Value Changed", value);
      // TODO: call this.ngOnChanges( o );
      this.getMappiMarkerFromMarkerItems(value).then( res=>{
        this.mappiMarkers=res 
      });
    } else
      this.mappiMarkers=this.markers.slice();
  }

  // mappiMarkers Getter/Setter
  _mappiMarkers: mappi.IMappiMarker[];
  get mappiMarkers() {
    return this._mappiMarkers;
  }
  set mappiMarkers(value: mappi.IMappiMarker[]) {
    this.mapComponent.clearMarkers();
    this._mappiMarkers = value;
    // BUG: if we call changeDetect from here, the markers will never be mapped
    // this.mgChangeDetect("MappiMarker");  
  }




  @ViewChild(GoogleMapsComponent) mapComponent: GoogleMapsComponent;  

  constructor( public markerService: MockDataService){
    Promise.resolve( ).then( res=>{
      this.layout = "default";
    })
  }

  ngOnInit() {
    const ready:Promise<any>[] = [];
    ready.push(this.getMarkerGroups());
    ready.push(this.mapComponent.mapReady);
    Promise.all(ready)
    .then( res=>{
      console.log("> HomePage ngOnInit");
    })
  }

  getMarkerItems(mg: IMarkerGroup) : Promise<IPhoto[]>  {
    return this.markerService.Photos.get(mg.markerItemIds)
      .then( res=>{
        res.sort( (a,b)=>{
          return a.dateTaken > b.dateTaken ? 1 : -1;
        })
        res.forEach( (o,i)=>o.seq=i )
        return res;
      })
  }

  getMarkerGroups() : Promise<any> {
    return this.markerService.MarkerGroups.get()
      .then( res => {
        let promises = [];
        res.forEach( mg=>{
          let pr = this.getMarkerItems(mg)
          .then( res=>{
            mg.markerItems = res;
          })
          promises.push(pr)
        })
        return Promise.all(promises).then( ()=>res);
      })
      .then( res => {
        res.sort( (a,b)=>a.seq-b.seq );
        this.markers=res;
        this.mappiMarkers=res.slice();
      });
  }

  /**
   * get array of IMarkerGroup.markerItems, IPhoto, to mark as markers on google map
   * @param mg IMarkerGroup, usually HomePage.mgFocus
   */
  getMappiMarkerFromMarkerItems(mg:IMarkerGroup){
    return Promise.resolve(mg.markerItems)
    .then ( (mi:IPhoto[])=>{
      const mappiMarkers:mappi.IMappiMarker[] = mi.map( mi=>{
        const mmLike:mappi.IMappiMarker = {
          uuid: null,
          loc: null,
          locOffset: [0, 0],
          label: mg.label,
          position: null,          
        }
        Object.assign(mmLike, mi );
        return mmLike;
      })
      return mappiMarkers;
    }).then( res => {
      res.sort( (a,b)=>a.seq-b.seq );
      return res;
    });
  }

  toggleEditMode() {
    if (this.layout != "edit") {
      this["_stash_layout"] = this.layout;
      this.layout = "edit";
    }
    else this.layout = this["_stash_layout"];
    console.log("home.page.ts: layout=", this.layout)
  }

  createMarkerGroup(ev:any){
    // create placeholder mg data
    const offset = [Math.random(), Math.random()].map(v=>(v-0.5)/60)
    const mg:IMarkerGroup = {
      // id: this.markers.length,
      uuid: quickUuid(),
      seq: this.markers.length, 
      label: null, 
      loc:  [0,0], 
      locOffset:[0,0], 
      placeId: null,
      position: {
        lat:0,
        lng:0
      },
      markerItemIds: [],
      markerItems: []
    }
    return this.markerService.Photos.get()
    .then( res=>{
      const random = Math.floor(Math.random() * Math.floor(res.length));
      let p = res[random];
      p = this.markerService.inflatePhoto(p, mg.markerItemIds.length);
      mg.loc = [ p.loc[0]+offset[0], p.loc[1]+offset[1] ];
      mg.position = {
        lat: mg.loc[0] + mg.locOffset[0],
        lng: mg.loc[1] + mg.locOffset[1],
      }
      mg.markerItemIds.push( p.uuid );
      mg.markerItems.push( p );
      return mg;
    })
    .then( mg=>{
      return this.markerService.MarkerGroups.post(mg)
    })
    .then( mg=>{
      // mg.label = this.obj2String(mg.position);
      this.markers.push(mg);
      this.mgChangeDetect("MarkerGroup", mg);
      // this.markerService.saveMarkerItem(p);
      // this.markerService.saveMarkerGroup(mg);
    })
  }

  removeMarkerGroup(item:IMarkerGroup){
    // TODO: call REST api: this.marker.remove(o.id)
    this.markers = this.markers.filter( o=> o.id!=item.id )
    // remove from mappi
    const m:mappi.IMappiMarker = item;
    MappiMarker.remove([m.marker]);
    // TODO: call REST api: this.marker.remove(o.uuid)
    this.markers = this.markers.filter( o=> o.uuid!=item.uuid )
  }

  mgChanged(ev:{mg:IMarkerGroup, change:string}){
    const {mg, change} = ev;
    switch (change) {
      case "markerItem":
        // run changeDetect for mg.markerItems
        this.mgFocus = mg;
        break;
    }
  }

  /**
   * HACK: force change detection with setTimeout()
   * @param changed string [MarkerGroup | MappiMarker]
   */
  mgChangeDetect(changed:string, o?:any){
    // TODO: force changeDetection with Observable??
    console.warn("[manual change detection:", changed, o);
    switch (changed){
      case "MarkerGroup":
        const value0 = this.markers.slice();
        setTimeout( ()=>{
          this.markers = value0;
          if (o)
            console.log(`HomePage.mgChange(): mg count=${this.markers.length}`, o);          
        });  
              
        break;
      case "MappiMarker":
        const value1 = this.mappiMarkers.slice();
        setTimeout( ()=>{
          this.mappiMarkers = value1;
        });
        break;
    }
  }

  // BUG: after reorder, <ion-item-options> is missing from dropped item
  reorderMarkerGroup(ev){
    // TODO: call REST api: to update mg.seq
    const {from, to} = ev.detail;
    const changed = [];
    this.markers.sort( (a,b)=>a.seq-b.seq )
    this.markers.forEach( (o,i,l)=>{
      if (i < Math.min(from, to) || i > Math.max(from, to)) {
        if (o.seq != i) console.error("sequence error", o);
        return;
      }
      if (i == from ){
        o.seq = Math.min(to, l.length-1);
      } 
      else i < from ? o.seq++ : o.seq--;
      changed.push({uuid:o.uuid, seq:o.seq});
    })
    this.markers.sort( (a,b)=>a.seq-b.seq )
    this.debug( "update markerGroup DB", changed )
  }

  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
  }
  private debug(...msg) {
    console.log(msg)
  }


}
