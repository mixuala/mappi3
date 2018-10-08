import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AlertController, ActionSheetController } from '@ionic/angular';
import { Plugins } from '@capacitor/core';
import { QRCodeModule } from 'angularx-qrcode';

import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, MappiService, } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';
import  { MockDataService, quickUuid,
  IMarkerGroup, IPhoto, IMarker,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';


const { Browser, Device } = Plugins;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit, IViewNavEvents {

  // layout of markerList > markerGroups > markerItems: [edit, default]
  public layout: string;
  // Observable for MarkerGroupComponent
  public mgCollection$ : Observable<IMarkerGroup[]>;
  // Observable for GoogleMapsComponent
  public markerCollection$ : Observable<IMarker[]>;
  public qrcodeData: string = null;
  public toggle:any = {};

  private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string}

  private _selectedMarkerGroup: string;
  public get selectedMarkerGroup() { return this._selectedMarkerGroup }
  public set selectedMarkerGroup(value: string) {
    this._selectedMarkerGroup = value;
    // console.warn( "HomePage setter: fire detectChanges() for selected", value);
    setTimeout(()=>this.cd.detectChanges())
  }


  
  // mgFocus Getter/Setter
  private _mgFocus: IMarkerGroup;
  get mgFocus() {
    return this._mgFocus;
  }
  set mgFocus(value: IMarkerGroup) {
    this._mgFocus = value;
    const markerItemsOrGroups:string = value ? "items" : "groups"; 
    switch (markerItemsOrGroups) {
      case "items":
        /****
         * render googleMaps markers for markerGroup Photos 
         */
        // MappiMarker.reset();
        const subject = this._getSubjectForMarkerItems(value);
        this.markerCollection$ = subject.watch$();
        break;
      case "groups":
        // MappiMarker.reset();
        this.selectedMarkerGroup = value ? value.uuid : null;
        this.markerCollection$ = this.mgCollection$;
        break;
    }
  }
  private _mgSub: SubjectiveService<IMarkerGroup>;

  constructor( 
    public dataService: MockDataService,
    public actionSheetController: ActionSheetController,
    public photoService: PhotoService,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ){
    this.dataService.ready()
    .then( ()=>{
      this._mgSub = this.dataService.sjMarkerGroups;
    })
  }

  private _getSubjectForMarkerItems(mg:IMarkerGroup):SubjectiveService<IMarker>{
    return MockDataService.getSubjByParentUuid(mg.uuid);
  }

  getSubjByParentUuid_Watch$ = (uuid:string)=>{
    const found = MockDataService.getSubjByParentUuid(uuid);
    return found && found.watch$();
  }



  // TEST only: sibling subscribes to the SAME BehaviorSubject
  siblingClicked(o:any){
    if (this.layout!='edit') return;
    const mg = o;
    this.childComponentsChange({data:o, action:'remove'});
    // this.applyChanges('commit');
  }

  public gmap:any;
  setMap(o:{map:google.maps.Map,key:string}){
    this.gmap=o;
    // console.log("google.maps.Map", this.gmap.map)
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
    // this.presentActionSheet_ShowMap(url);
    this.qrcodeData = url;
    
  }



  async presentActionSheet_ShowMap(url) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Map Image',
      subHeader: url,
      buttons: [{
        text: 'Show Map',
        icon: 'map',
        handler: () => {
          console.log(url);
          setTimeout( ()=>{this.browserOpen(url)},500)
          
        }        
      }, {
        text: 'Cancel',
        icon: 'close',
        role: 'cancel',
        handler: () => {
          this.qrcodeData = null;
          console.log('Cancel clicked');
        }
      }]
    });
    await actionSheet.present();
  }

  async browserOpen(url):Promise<void> {
    return await Browser.open({url:url})
  }

  ngOnInit() {
    this.layout = "default";
    const mListId = this.route.snapshot.paramMap.get('uuid');

    // // BUG: mgCollection$ must be set here, or template will not load
    this._mgSub = this.dataService.sjMarkerGroups;
    this.mgCollection$ = this._mgSub.get$([]);

    this.dataService.ready()
    .then( ()=>{
      let mgSubject = MockDataService.getSubjByParentUuid(mListId) as SubjectiveService<IMarkerGroup>;
      if (!mgSubject) {
        // for testing only, reload /home
        console.warn("DEV ONLY: Subject not ready, loading all markerGroups")
        const DEV_Subject = this._mgSub;
        DEV_Subject.get$('all');
        MockDataService.getSubjByParentUuid(mListId, DEV_Subject);
        mgSubject = DEV_Subject;
      } 
      this.markerCollection$ = this.mgCollection$ = mgSubject.watch$();
      this._mgSub = mgSubject;
      // this.mgCollection$.subscribe( arr=>{
      //   console.info(`HomePage ${mListId} mgs, count=`, arr.length);
      //   arr.forEach( o=>console.log(o))
      // });
    } )
  }

  viewWillLeave(){
    console.log("viewWillLeave: HomePage")
  }

  ngOnDestroy() {
    console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
  }


  toggleEditMode(action:string) {
    if (this.layout != "edit") {
      this.toggle.layout = this.layout;
      this.layout = "edit";
      console.log("home.page.ts: layout=", this.layout)
    }
    else {
      return this.applyChanges(action)
      .then( 
        res=>{
          this.layout = this.toggle.layout;
          console.log("home.page.ts: layout=", this.layout)
        },
        err=>console.log('ERROR saving changes')
      )
    }    
    
  }

  private _getPlaceholder(data:any, seq?:number):IMarkerGroup {
    const mg:IMarkerGroup = Object.assign({
      uuid: quickUuid(),
      seq: seq, 
      label: '', 
      loc: [0,0], 
      locOffset:[0,0], 
      placeId: null,
      position: {
        lat:0,
        lng:0
      },
      markerItemIds: [],
    }, data);
    mg.position = MappiMarker.position(mg);
    return mg;
  }



  /**
   * create a new MarkerGroup from 1) a map click/location or 2) from the create button,
   *  specifying either a selected image or mapCenter as the marker location
   * @param data IMarker properties, specifically [loc | seq]
   * @param ev click event
   * 
   */
  createMarkerGroup(ev:any={}, data:any={}):Promise<IMarkerGroup>{
    const target = ev.target && ev.target.tagName;
    const count = data.seq || this._mgSub.value().length;
    let p: IPhoto;
    return Promise.resolve(true)
    .then ( ()=>{
      if (target=='ION-BUTTON') {
        return this.photoService.choosePhoto(0)
        .then( photo=>{
          p = photo;
          const {loc, locOffset, position, placeId} = p;
          let options:any = {loc, locOffset, position, placeId};
          options.seq = count;
          options.markerItemIds = [p.uuid];
          options['_commit_markerItem_0'] = p;
          p['_rest_action'] = 'post'
          // TODO: need to add IPhoto to the mg.subject
          // const subject = this._getSubjectForMarkerItems(mg);
          return options;
        })
      }
      return Promise.reject('continue');
    })
    .catch( (err)=>{
      if (err=='continue') {
        // no IPhoto returned, get a placeholder
        const mapCenter = this.gmap.map.getCenter();
        const defaults = {
          loc:[mapCenter.lat(), mapCenter.lng()],
          seq: count,
        }
        const options = Object.assign({}, defaults, data);
        if (!data.loc) options["_loc_was_map_center"] = true;
        return options;
      }
    }) 
    .then( (options:any)=>{
      const mg = this._getPlaceholder(options, count);
      mg.label = `Marker created ${new Date().toISOString()}`
      this.childComponentsChange({data:mg, action:'add'});
      return mg;
    })
    .then( (mg:IMarkerGroup)=>{
      if (mg.markerItemIds.length) {
        // NOTE: this subject is NOT created until the MarkerItem is rendered
        setTimeout( ()=>{
          const subject = this._getSubjectForMarkerItems(mg);
          if (!subject) console.warn("ERROR: possible race condition when creating MarkerGroup from IPhoto")
          subject.next([p])
        },100)
      }
      return mg
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

  mappiMarkerChange(change:{data:IMarker, action:string}){
    const mm = change.data;
    // mm could be either IMarkerGroup or IPhoto
    if (!this.mgFocus) {
      // handle IMarkerGroup
      const items = this._getCachedMarkerGroups();
      switch (change.action) {
        case 'add':   // NOTE: ADD IMarkerGroup by clicking on map in layout=edit
          const options = {
            loc: mm.loc,
            // manually trigger ChangeDetection when click from google.maps
            _detectChanges: 1,
          };
  
          // create MarkerGroup at IMarker location
          return this.createMarkerGroup(undefined, options)
            .then((mg) => {
              if (options._detectChanges) setTimeout(() => this.cd.detectChanges())
            });
        case 'update':    // NOTE: can update IMarkerGroup or IPhoto
          this.handle_MarkerGroupMoved(change);
          break;
      }
    } else if (this.mgFocus) {
      this.handle_MarkerItemMoved(change);
    }
  }

  handle_MarkerGroupMoved(change:{data:IMarker, action:string}){
    const mm = change.data;
    const items = this._getCachedMarkerGroups();
    const found = items.findIndex(o => o.uuid == mm.uuid);
    if (~found) {
      const { loc, locOffset } = mm;
      const mg = Object.assign(items[found], { loc, locOffset });
      mg.position = MappiMarker.position(mg);
      this.childComponentsChange({ data: mg, action: 'update' });
      // run changeDetection, by changing object reference
      // items.splice(found, 1, mg);
      this._mgSub.next(items);

      setTimeout(()=>this.cd.detectChanges())
      // BUG: need to call cd.detectChanges from the MarkerItemComponent
      console.warn("BUG: need to call cd.detectChanges from the MarkerItemComponent");
    }
  }

  handle_MarkerItemMoved(change:{data:IMarker, action:string}){
    const marker = change.data;
    const mg = this.mgFocus;
    const miCollectionSubject = this._getSubjectForMarkerItems( mg );
    const items = miCollectionSubject.value();
    if (change.action = 'update') {
      const found = items.findIndex(o => o.uuid == marker.uuid);
      if (~found) {
        const { loc, locOffset } = marker;
        const mi = Object.assign(items[found], { loc, locOffset });
        mi.position = MappiMarker.position(mi);

        // needs to be MarkerGroupComponent, or needs to be moved to component controller
        // this.MarkerGroupComponent.childComponentsChange({ data: mi, action: 'update' });
        mi['_rest_action'] = mi['_rest_action'] || 'put';
        
        // run changeDetection, by changing object reference
        // items.splice(found, 1, mi);
        miCollectionSubject.next(items);

        setTimeout(()=>this.cd.detectChanges())
      }        
    }
  }

  openGallery(ev:{mg:IMarkerGroup, mi:IPhoto}) {
    const {mg, mi} = ev;
    const items:PhotoSwipe.Item[] = []; 

    const mgPhotos_subject = this._getSubjectForMarkerItems(mg);
    mgPhotos_subject.value().map( (p:IPhoto)=>{
      items.push({
        src: p.src,
        w: p.width,
        h: p.height,
      });
    });
    const found = mgPhotos_subject.value().findIndex( p=>p.uuid==mi.uuid );
    const index = ~found ? found : 0;
    const uuid = mg.uuid;
    this.gallery = {items, index, uuid};
  }


  /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  childComponentsChange( change: {data:IMarkerGroup, action:string}){
    if (!change.data) return;
    const mg = change.data;
    switch(change.action){
      case 'selected':
        this._selectedMarkerGroup = mg.uuid;
        break;
      case 'add':
        const newMg = change.data;
        newMg['_rest_action'] = 'post';
        const items = this._getCachedMarkerGroups();
        items.push(newMg);
        this._mgSub.next(items);
        return;
      case 'update_marker':
        // mg.markerItemIds updates have already been committed

        // update google.map.Marker position directly
        const m = MappiMarker.findByUuid([mg.uuid]).shift();
        m.setPosition(mg.position);

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
    const children:Promise<IMarkerGroup|boolean>[] = items.map( o=>{
      const restAction = o._rest_action;
      delete o._rest_action;
      switch(restAction) {
        case "post":
          return Promise.resolve()
          .then( ()=>{
            if (o.hasOwnProperty('_commit_markerItem_0'))
              return this.dataService.Photos.post( o['_commit_markerItem_0']);
          })
          .then( 
            (p:IPhoto)=>delete o['_commit_markerItem_0']
            ,(err)=>console.error("Error saving MarkerItem of MarkerGroup")  
          )
          .then( ()=>{
            return this.dataService.MarkerGroups.post(o);
          })
        case "put":
          return this.dataService.MarkerGroups.put(o.uuid, o);
        case "seq":
          // return true;
          return this.dataService.MarkerGroups.put(o.uuid, o, ['seq']);  
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
          const remainingItems = this._getCachedMarkerGroups('visible')
          .sort( (a,b)=>a.seq-b.seq )
          .map((o,i)=>{
            o.seq = i;    // re-index remaining/visible items
            if (!o._rest_action) o._rest_action = 'seq';
            return o;
          });
          const allItems = remainingItems.concat(this._getCachedMarkerGroups('removed'))
          return this.childComponents_CommitChanges(allItems)
          .catch( err=>{
            console.error("ERROR: problem saving child nodes ");
            Promise.reject(err);
          })
          .then( res=>{
            this._mgSub.reload( remainingItems.map(o=>o.uuid) );
            return res;
          })
          .then( (res:IMarkerGroup[])=>{
            // propagate changes to MarkerList
            const mListId = this.route.snapshot.paramMap.get('uuid');
            const mList = this.dataService.sjMarkerLists.value().find( o=>o.uuid==mListId);
            mList.markerGroupIds = res.map( o=>o.uuid);
            this.dataService.MarkerLists.put(mList.uuid, mList);
            // put this on a setTimeout??
            this.dataService.sjMarkerLists.reload();
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
    else if (option=='removed')
      items = items.filter( o=>o._rest_action== 'delete') // skip removed items  

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
