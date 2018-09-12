import { Component, ViewChild } from '@angular/core';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';
import  { MockDataService, 
  IMarkerGroup,  IPhoto,
} from '../providers/mock-data.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {

  edit: boolean = false;
  mgFocus: IMarkerGroup;
  // layout of markerList > markerGroups > markerItems: [edit, default]
  layout: string;
  markers: IMarkerGroup[] = [];


  @ViewChild(GoogleMapsComponent) mapComponent: GoogleMapsComponent;  

  constructor( public markerService: MockDataService ){
    this.getMarkerGroups();
    Promise.resolve( ).then( res=>{
      this.layout = "default";
    })
  }

  getMarkerItems(mg: IMarkerGroup) : Promise<IPhoto[]>  {
    return this.markerService.getPhotos(mg.markerItemIds)
      .then( res=>{
        res.sort( (a,b)=>{
          return a.dateTaken > b.dateTaken ? 1 : -1;
        })
        res.forEach( (o,i)=>o.seq=i )
        return res;
      })
  }

  getMarkerGroups() : void {
    this.markerService.getMarkers()
      .then( res => {
        let promises = [];
        res.forEach( mg=>{
          let pr = this.getMarkerItems(mg)
          .then( res=>{
            mg.markerItems = res;
          })
          promises.push(pr)
        })
        return Promise.all(promises).then( o => res);
      })
      .then( res => {
        this.markers=res;
        this.markers.sort( (a,b)=>a.seq-b.seq )
        // this.markers.reverse()
      });
  }

  toggleEditMode() {
    this.edit = !this.edit;
    if (this.edit) {
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
      id: this.markers.length,
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
    return this.markerService.getPhotos()
    .then( res=>{
      const random = Math.floor(Math.random() * Math.floor(res.length))
      let p = res[random];
      p = this.markerService.inflatePhoto(p, mg.markerItemIds.length)
      mg.loc = [ p.loc[0]+offset[0], p.loc[1]+offset[1] ];
      mg.position = {
        lat: mg.loc[0] + mg.locOffset[0],
        lng: mg.loc[1] + mg.locOffset[1],
      }
      mg.markerItemIds.push( random );
      mg.markerItems.push( p );
      return mg;
    })
    .then( mg=>{
      // mg.label = this.obj2String(mg.position);
      this.markers.push(mg);
      // this.markerService.saveMarkerItem(p);
      // this.markerService.saveMarkerGroup(mg);
    })
  }

  removeMarkerGroup(mg:IMarkerGroup){
    // TODO: call REST api: this.marker.remove(o.id)
    this.markers = this.markers.filter( o=> o.id!=mg.id )

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
      else i < from ? i+1 : i-1 ;
      changed.push({id:o.id, seq:o.seq});
    })
    this.markers.sort( (a,b)=>a.seq-b.seq )
    // const changed = this.markers.reduce( (res,o)=>{
    //   if (Math.min(from, to) <= o.seq && o.seq <= Math.max(from, to)) 
    //     res.push({id:o.label, seq:o.seq});
    //   return res;
    // }, []) 
    this.debug( "update markerGroup DB", changed )
  }

  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
  }
  private debug(...msg) {
    console.log(msg)
  }



	testMarker(){

    let center = this.mapComponent.map.getCenter();
    this.mapComponent.addMarker(center.lat(), center.lng());
    console.log( `lat: ${center.lat()}, lng: ${center.lng()}` )

  }
  
  clearMarkers(){
    this.mapComponent.clearMarkers();
  }


}
