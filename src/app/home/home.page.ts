import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { catchError, flatMap } from 'rxjs/operators';
import { AlertController, ActionSheetController } from '@ionic/angular';

import { MappiMarker, MappiService, } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';
import  { MockDataService, quickUuid,
  IMarkerGroup,  IPhoto,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {

  // layout of markerList > markerGroups > markerItems: [edit, default]
  public layout: string;
  public mgCollection$ : Observable<IMarkerGroup[]>;
  
  // mgFocus Getter/Setter
  private _mgFocus: IMarkerGroup;
  get mgFocus() {
    return this._mgFocus;
  }
  set mgFocus(value: IMarkerGroup) {
    this._mgFocus = value;
  }
  private _mgSub: SubjectiveService<IMarkerGroup>;

  constructor( 
    public dataService: MockDataService,
    public actionSheetController: ActionSheetController,
    private cd: ChangeDetectorRef,
  ){
    this.dataService.ready()
    .then( ()=>this._mgSub = this.dataService.sjMarkerGroups )
  }




  // sibling subscribes to the SAME BehaviorSubject
  siblingClicked(o:any){
    if (this.layout!='edit') return;
    const mg = o;
    this.childComponentsChange({data:o, action:'remove'});
    this.applyChanges('commit');
  }

  public gmap:any;
  setMap(o:{map:google.maps.Map,key:string}){
    this.gmap=o;
    console.log("google.maps.Map", this.gmap.map)
  }
  // TODO: move to GoogleMapsComponent??
  // see: https://developers.google.com/maps/documentation/maps-static/dev-guide
  getStaticMap(){
    // helper functions
    const round6 = (n:number):number=>Math.round(n*1e6)/1e6
    const mapDim = (fit640?:boolean)=>{
      const MAX_DIM = 640;
      const {width, height} = map.getDiv().getBoundingClientRect();
      const max_dim = Math.min( Math.max( width, height), MAX_DIM);
      let scale = max_dim/Math.max(width,height);
      if (!fit640) scale = Math.min(1, scale);
      return [width,height].map(n=>Math.floor(n*scale));
    }  
    
    const baseurl = "https://maps.googleapis.com/maps/api/staticmap?";
    const map = this.gmap.map;
    const markerSyles={
      size: 'mid',
      color: 'green',
    }
    const markerGroups = this._getCachedMarkerGroups('visible');
    const markerSpec = []
    markerGroups.forEach( (m,i)=>{
      const {lat, lng} = m.position;
      markerSyles['label'] = i+1;
      const marker = [
        Object.entries(markerSyles).map( el=>el.join(':') ).join('%7C'),
        [lat,lng].map( n=>round6(n) ).join(','),
      ]
      markerSpec.push(marker.join('%7C'));
    })

    const params = {
      center: map.getCenter().toUrlValue(),
      zoom: map.getZoom(),
      size: mapDim().join('x'), // '512x512',
      scale:2,
      mapType: map.getMapTypeId(),
      markers: markerSpec.join('&markers='),
      key: this.gmap.key
    }
    // console.log(params);
    // console.log(markerSpec);
    const url = baseurl + Object.entries(params).map( el=>el.join('=') ).join('&');
    console.log(url); 
    this.presentActionSheet_ShowMap(url)
    
  }

  // window.open("http://google.com",'_system', 'location=yes');

  async presentActionSheet_ShowMap(url) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Map Image',
      subHeader: url,
      buttons: [{
        text: 'Show Map',
        icon: 'map',
        handler: () => {
          console.log(url);
          setTimeout( ()=>{window.open(url,'_system', 'location=yes');},500)
          
        }        
      }, {
      //   text: 'Share',
      //   icon: 'share',
      //   handler: () => {
      //     console.log('Share clicked');
      //   }
      // }, {
        text: 'Cancel',
        icon: 'close',
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked');
        }
      }]
    });
    await actionSheet.present();
  }




  ngOnInit() {
    this.layout = "default";

    this.mgCollection$ = this._mgSub.get$();
    // this.mgCollection$.subscribe( arr=>{
    //   console.warn("HomePage.mgCollection$, count=", arr.length);
    // });
  }


  toggleEditMode(action:string) {
    if (this.layout != "edit") {
      this["_stash_layout"] = this.layout;
      this.layout = "edit";
    }
    else {
      return this.applyChanges(action)
      .then( 
        res=>{
          this.layout = this["_stash_mgLayout"];
        },
        err=>console.log('ERROR saving changes')
      )
    }    
    console.log("home.page.ts: layout=", this.layout)
  }

  createMarkerGroup(data:any={}, ev?:any):Promise<IMarkerGroup>{
    // create placeholder mg data
    
    const count = this._mgSub.value().length;
    const random = (Date.now() % count) +1;
    
    return Promise.resolve(true)
    .then( ()=>{
      const mg:IMarkerGroup = Object.assign({
        uuid: quickUuid(),
        seq: count, 
        label: "", 
        loc: [0,0], 
        locOffset:[0,0], 
        placeId: null,
        position: {
          lat:0,
          lng:0
        },
        markerItemIds: [],
      }, data);
  
      // debugging only
      if (data.loc) mg.seq = -mg.seq;

      if (!data.loc) return Promise.reject(mg)
      return Promise.resolve(mg)
    })
    .catch( mg=>{
      // get a marker loc by adding a random offset to a random photo
      const offset = [Math.random(), Math.random()].map(v=>(v-0.5)/60);

      return this.dataService.Photos.get()
      .then( photos=>{
        
        let p = photos[random];
        p = this.dataService.inflatePhoto(p, mg.markerItemIds.length);
        mg.loc = [ p.loc[0]+offset[0], p.loc[1]+offset[1] ];

        return p;
      }).then( p=>{
        // // add random photo to the markerGroup
        // mg.markerItemIds.push( p.uuid );
        return mg;
      })
    })
    .then( mg=>{
      // update position
      mg.position = MappiMarker.position(mg);

      this.childComponentsChange({data:mg, action:'add'})
      return mg;
    })
  }

  // BUG: after reorder, <ion-item-options> is missing from dropped item
  reorderMarkerGroup(ev){
    // make changes to local copy, not BehaviorSubject/DB
    const localCopy = this._getCachedMarkerGroups('visible');
    const {from, to} = ev.detail;
    let move = localCopy.splice(from,1);
    localCopy.splice( to, 0, move[0]);

    // re-index after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = localCopy[i];
      o.seq=i;
      this.childComponentsChange({data:o, action:'move'})
    }
    this._mgSub.next(this._getCachedMarkerGroups());
  }

  mappiMarkerChange(change:{data:mappi.IMappiMarker,action:string}){
    const mm = change.data;
    const items = this._getCachedMarkerGroups();
    switch(change.action){
    case 'add':
      const data = {
        loc: mm.loc,
        // manually trigger ChangeDetection when click from google.maps
        _detectChanges: 1, 
      };
      
      return this.createMarkerGroup(data)
      .then((mg)=>{
        if (data._detectChanges) setTimeout(()=>this.cd.detectChanges())
      });
    case 'update':
      const found = items.findIndex(o=>o.uuid==mm.uuid);
      if (~found){
        const {loc, locOffset} = mm;
        const mg = Object.assign({}, items[found], {loc, locOffset});
        const o = {data:mg, action:change.action};
        this.childComponentsChange(o);
        // run changeDetection, by changing object reference
        items.splice(found,1,mg);
        this._mgSub.next(items);
      }
      break;
    }
  }

  /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  childComponentsChange( change: {data:IMarkerGroup, action:string}){
    if (!change.data) return;
    const mg = change.data;
    switch(change.action){
      case 'add':
        const newMg = change.data;
        newMg['_rest_action'] = 'post';
        const items = this._getCachedMarkerGroups();
        items.push(newMg);
        this._mgSub.next(items);
        return;
      case 'update_marker':
        // mg.markerItemIds updates have already been committed
        let check = mg;
        let mgs = this._getCachedMarkerGroups();
        this._mgSub.next(mgs);
        return;   
      case 'update':
        mg['_rest_action'] = mg['_rest_action'] || 'put';
        // this._mgSub.next(this._getCachedMarkerGroups());
        return;    
      case 'move':
        mg['_rest_action'] = mg['_rest_action'] || 'put';
        return;
      case 'remove':
        // called from MarkerGroupComponent.removeMarkerGroup()
        mg['_rest_action'] = 'delete';
        this._mgSub.next(this._getCachedMarkerGroups());
        return;
    }
  }

  childComponents_CommitChanges(items:IMarkerGroup[]):Promise<any>{
    const children:Promise<any>[] = items.map( o=>{
      const restAction = o._rest_action;
      delete o._rest_action;
      switch(restAction) {
        case "post":
          return this.dataService.MarkerGroups.post(o);
        case "put":
          return this.dataService.MarkerGroups.put(o.uuid, o);
        case "delete":
          return this.dataService.MarkerGroups.delete(o.uuid)
      }
    });
    return Promise.all(children); 
  }

  applyChanges(action:string):Promise<any> {
    return Promise.resolve(true)
    .then( res=>{
      switch(action){
        case "commit":
          const allItems = this._getCachedMarkerGroups('commit');
          const remainingItems = this._getCachedMarkerGroups('visible');
          return this.childComponents_CommitChanges(allItems)
          .catch( err=>{
            console.error("ERROR: problem saving child nodes ");
            Promise.reject(err);
          })
          .then( res=>{
            this._mgSub.reload( remainingItems.map(o=>o.uuid) );
          })          
        case "rollback":
          const uuids = this._getCachedMarkerGroups('rollback')
          .map( o=>o.uuid );
          this._mgSub.reload( uuids );
      }
    })
  }

  private _getCachedMarkerGroups(option?:string):IMarkerGroup[] {
    let items = this._mgSub.value();
    
    if (option=='rollback') 
      items = items.filter( o=>o._rest_action!= 'post') // skip added items
    else if (option=='visible')
      items = items.filter( o=>o._rest_action!= 'delete') // skip removed items

    items.sort( (a,b)=>a.seq-b.seq );
    return items;
  }


  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
  }
  private debug(...msg) {
    console.log(msg)
  }


}
