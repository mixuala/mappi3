import { Component, OnInit, Input, Output, ViewChild,
  ChangeDetectionStrategy, ChangeDetectorRef, 
} from '@angular/core';
import { Location, } from '@angular/common';
import { ActivatedRoute, Router, NavigationStart } from '@angular/router';
import { List, ModalController } from '@ionic/angular';
import { Observable, BehaviorSubject, Subject, fromEventPattern } from 'rxjs';
import { filter, skipWhile, takeUntil, switchMap, map, debounceTime } from 'rxjs/operators';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto, IMapActions, IMoment,
} from '../providers/types';
import  { 
  MockDataService, RestyTrnHelper, quickUuid,
} from '../providers/mock-data.service';
import { IViewNavEvents } from "../app-routing.module";
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService, PhotoLibraryHelper, } from '../providers/photo/photo.service';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { AppConfig } from '../providers/helpers';
import { ImgSrc,  } from '../providers/photo/imgsrc.service';
import { AppCache } from '../providers/appcache';

import { CamerarollPage } from '../cameraroll/cameraroll.page';



@Component({
  selector: 'app-list',
  templateUrl: 'list.page.html',
  styleUrls: ['list.page.scss']
})
export class ListPage implements OnInit, IViewNavEvents {
  
  public layout: string;
  public mapSettings: IMapActions = {
    dragend: false,
    click: true,
    initialZoom: AppConfig.initialMapZoom,
    resetBounds: false,  // TODO: add to interface
  }
  // Observable for MarkerListComponent
  public mListCollection$ : Observable<IMarkerList[]>;
  // Observable for GoogleMapsComponent
  public markerCollection$ : Observable<IMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {};

  @ViewChild('markerListList') slidingList: List;

  private _mListSub: SubjectiveService<IMarkerList>;
  
  private _selectedMarkerList: string;
  public get selectedMarkerList() { return this._selectedMarkerList }
  public set selectedMarkerList(value: string) {
    this._selectedMarkerList = value;
    // console.warn( "HomePage setter: fire detectChanges() for selected", value);
    setTimeout(()=>this.cd.detectChanges())
  }

  constructor( 
    public dataService: MockDataService,
    public photoService: PhotoService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef,
  ){
    this.dataService.ready()
    .then( ()=>{
      this._mListSub = this.dataService.sjMarkerLists;
    });

    this.router.events
    .pipe( 
      takeUntil(this.unsubscribe$),
      filter( (e:Event)=>e instanceof NavigationStart) 
    )
    .subscribe( (e: NavigationStart)=>console.log("routingDestination", e.url) );

  }

  async ngOnInit() {
    this.layout = "default";
    const waitFor = [ this.dataService.ready(), AppConfig.mapReady ];
    await Promise.all(waitFor);

    const _filterByMapBounds = map( (arr:IMarkerList[])=>{
      return arr.filter( o=>{
          const mapBounds = AppConfig.map.getBounds();
          const keep = mapBounds.contains( new google.maps.LatLng(o.position.lat, o.position.lng));
          // if (keep) o['_detectChanges']=true;  // trigger changeDetection in MarkerListComponent
          return keep;
        })
    } );

    // for async binding in view
    this.mListCollection$ = this._mListSub.watch$()
    .pipe( 
      skipWhile( (arr)=>!this.stash.activeView ),
      _filterByMapBounds,
    );

    this.stash.activeView = true;
    
    // for map marker rendering
    this.markerCollection$ = this.mListCollection$
    
    /**
     * search for MarkerLists by mapBounds, or city, or category, etc. 
     * */ 
    this._mListSub.get$();
  }

  handleMapMoved() {
    let lastBounds = AppConfig.map.getBounds();

    const _searchWhenMapMoves = ()=>{
      if (!this.stash.activeView) return;
      const mapBounds = AppConfig.map.getBounds();
      const isChanged = mapBounds.equals(lastBounds) == false;
      if (!isChanged) return;
      lastBounds = mapBounds;

      // const items = this._mListSub.resty.get( {bounds: mapBounds} );  // query Resty with mapBounds
      // DEV hack, triggers: this.mListCollection$ = watch$().pipe(_filterByMapBounds()) to modify results
      this._mListSub.repeat();  // debounceTime(500)
      this.cd.detectChanges();
    }
    // use Observable.fromEventPattern() so we can use debounceTime
    // see: https://stackoverflow.com/questions/42727629/how-to-convert-custom-library-events-ie-google-maps-events-into-observable-st
    fromEventPattern(
      (handler:()=>void)=>{
          return AppConfig.map.addListener('bounds_changed', handler );
      },
      (handler, listener)=>{
          google.maps.event.removeListener(listener);
      }
    ).pipe( 
      takeUntil(this.unsubscribe$),
      skipWhile( ()=>!this.stash.activeView),
      debounceTime(200),
    ).subscribe( ()=>{
      _searchWhenMapMoves()
    });
  }

  async zoomOutUntilMarkerVisible() {
    const MIN_ZOOM = 2;
    const ZOOM_STEP = 3;
    let visible = MappiMarker.visible(AppConfig.map['id']);
    if (visible.length==0) {
      let nextZoom:number;
      do {
        nextZoom = Math.max(AppConfig.map.getZoom()-ZOOM_STEP, MIN_ZOOM);
        setTimeout( ()=>AppConfig.map.setZoom( nextZoom ), 250 ); 
        const ready = await GoogleMapsHostComponent.waitForMapIdle(AppConfig.map);
        visible = MappiMarker.visible(AppConfig.map['id']);
      } while (nextZoom>MIN_ZOOM && visible.length==0)
    }    
  }

  async viewWillEnter(){
    console.warn("viewWillEnter: ListPage");
    await AppConfig.mapReady;
    setTimeout( async ()=>{
      // wait 1000ms to let initial map render complete before activating _filterByMapBounds()
      this.handleMapMoved();
      // this.zoomOutUntilMarkerVisible();
    }, 1000);
    
    try {
      this.stash.activeView = true;
      // const mapCenter = this.route.snapshot.params['map-center'];
      const snapshot = this.route.snapshot;
      const mapCenter = this.route.snapshot.params['map-center'];
      if (mapCenter) {
        const loc = mapCenter.split(',');
        this.stash.mapPosition = Object.assign( this.stash.mapPosition || {}, {center: new google.maps.LatLng( loc[0], loc[1])} );
        this.location.replaceState(this.location.path().split(';').shift());
        // BUG: this line doesn't work
        // if (this.route.snapshot.queryParams) this.router.navigate([], {relativeTo: this.route, replaceUrl:true} )
      }
      if ( this.stash.mapPosition ) {
        AppConfig.map.setOptions( this.stash.mapPosition );
      }
      this._mListSub.reload();
    } catch (err) {console.warn(err)}    
  }

  viewWillLeave(){
    try {
      this.stash.activeView = false;
      this.stash.mapPosition = {center: AppConfig.map.getCenter(), zoom:AppConfig.map.getZoom()};
      console.warn("viewWill-Leave: ListPage");
      ImgSrc.retryBroken();
    } catch (err) {console.warn(err)}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }

  nav(page:string, item:IMarkerList, options:any={}){
    // this.router.navigate(['/home', {uuid: item.uuid}]);
    console.log("click: nav to item=", item.uuid)
    this.router.navigate([page, item.uuid], options);
  }

  private _getSubjectForMarkerGroups(mL:IMarkerList):SubjectiveService<IMarker>{
    return MockDataService.getSubjByParentUuid(mL.uuid);
  }

  toggleEditMode(action:string) {
    if (this.layout != "edit") {
      this.stash.layout = this.layout;
      this.layout = "edit";
      console.log("list.page.ts: layout=", this.layout)
    }
    else {
      return this.applyChanges(action)
      .then( 
        res=>{
          this.layout = this.stash.layout;
          console.log("list.page.ts: layout=", this.layout)
        },
        err=>console.log('ERROR saving changes')
      )
    }    
  }


  async createOpenMarkerList(ev:any={}){

    if ("use CamerarollPage") {
      const options = {
        onDismiss: async (resp:any={}):Promise<void> => {
          if (!resp.selected || !resp.selected.length) return;
          console.log( "Create MarkerList from selected=", resp.selected);
          await this.createMarkerList_from_Cameraroll(resp)
          .then( mL=>{ 
            AppCache.for('Key').set(mL, mL.uuid);
            this.nav('home', mL, {
              queryParams:{
                layout:'edit'
              }
            });
          })
          return;
        },
      };
      // return CamerarollPage.navPush(options);
      const selected = await CamerarollPage.presentModal(this.modalCtrl, options);
      return;
    }

    return this.createMarkerList_from_Camera(undefined)
    .then( mL=>{
      AppCache.for('Key').set(mL, mL.uuid);
      this.nav('home', mL, {
        queryParams:{
          layout:'edit'
        }
      });
    })
    
  }

  /**
   * create a new MarkerList from CamerarollPage Modal
   * @param data {selected:IPhoto[]}, expecting IPhoto._moment: IMoment
   */
  async createMarkerList_from_Cameraroll(data:any={}):Promise<IMarkerList>{
    return CamerarollPage.createMarkerList_from_Cameraroll(data.selected, this._mListSub);
  }

  

  /**
   * create a new MarkerList from the create button,
   *  specifying either a selected image or mapCenter as the marker location
   * use this.photoService.choosePhoto(0) to select photo
   * @param data IMarker properties, specifically [loc | seq]
   * @param ev click event
   * 
   */
  async createMarkerList_from_Camera(ev:any={}):Promise<IMarkerList>{
    const target = ev.target && ev.target.tagName;
    const count = this._mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Trip created ${item.created.toISOString()}`;
    item.seq = count;
    const child:IMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    child.label = `Marker created ${child.created.toISOString()}`;
    child.seq = 0;
    return this.photoService.choosePhoto(0)
    .then( (p:IPhoto)=>{
      // create IPhoto < IMarkerGroup < IMarkerList
      console.log( "### ListPage.choosePhoto, photo=",p, AppCache.for('Cameraroll').get(p.camerarollId));
      RestyTrnHelper.setFKfromChild(child, p);
      RestyTrnHelper.setFKfromChild(item, child);
      if (MappiMarker.hasLoc(p)) {
        RestyTrnHelper.setLocFromChild(child, p);
        RestyTrnHelper.setLocFromChild(item, child);
        return;
      }
      else return Promise.reject('continue');
    })
    .catch( async (err)=>{
      if (err=='continue') {
        let latlng = AppConfig.map && AppConfig.map.getCenter();
        if (!latlng) 
          latlng = await GoogleMapsHostComponent.getCurrentPosition();
        const position = latlng.toJSON();
        RestyTrnHelper.setLocToDefault(item, position);
        RestyTrnHelper.setLocToDefault(child, position);
        return Promise.resolve();
      }
      // possible error from this.photoService.choosePhoto()
      console.warn('ListPage.createMarkerList_from_Camera()',err);
    })
    .then( ()=>{
      RestyTrnHelper.childComponentsChange({data:item, action:'add'}, this._mListSub);
      return item;
    });
  }

  /**
   * create a new MarkerList from a map click/location (set the map center)
   * see: app-google-maps[(itemChange)] => mappiMarkerChange({action:'add})
   * @param data IMarker properties, specifically [loc | seq]
   * 
   */
  async createMarkerList_from_Loc(data:any={}):Promise<IMarkerList>{
    const count = data.seq || this._mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Map created ${item.created.toISOString()}`;
    item.seq = count;
    const child:IMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    child.label = `Marker created ${child.created.toISOString()}`;
    return Promise.resolve(true)
    .then( async ()=>{
      let latlng = AppConfig.map && AppConfig.map.getCenter();
      if (!latlng) 
        latlng = await GoogleMapsHostComponent.getCurrentPosition();
      const position = latlng.toJSON();
      RestyTrnHelper.setLocToDefault(item, position);
      RestyTrnHelper.setLocToDefault(child, position);
      if (data.loc){ 
        item['_loc_was_map_center'] = false;
      }
      return item;
    })
    .then( ()=>{
      RestyTrnHelper.childComponentsChange({data:item, action:'add'}, this._mListSub);
      return item;
    });
  }




  // called by GoogleMapComponents, marker click
  handle_MapMarkerSelected(uuid:string){
    this.selectedMarkerList = uuid;
    this.nav('map', {uuid} as IMarkerList )
  }

  handle_MarkerListSelected(marker:IMarkerList){
    // if ( this.selectedMarkerList == marker.uuid ) {
    //   // console.warn("Testing Native.LaunchNavigator on repeated select")
    //   // this.launchApp('Map', marker.uuid);          
    // }
    this.selectedMarkerList = marker.uuid;
  }
  /**
   * reload after commit/rollback
   */
  async reload(changed:IMarker[]=[]){
    await this._mListSub.get$();
  }


  /*
   * additional event handlers, possibly called from @ViewChilds
   */
  childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    const mLists = this._mListSub.value();
    switch(change.action){
      case 'reload':
        this._mListSub.reload();   // called by action="rollback" from child
        return;
      case 'selected':
        // return this.selectedMarkerList = change.data.uuid;
        // invoked by ion-icon[pin](click) from MarkerGroupComponent
        return this.handle_MarkerListSelected(change.data as IMarkerList)
      case 'prompt':
        // Prompt.getText() already committed, just reload
        return this._mListSub.reload();
      case 'remove':
        // const item:IRestMarker = mLists.find(o=>o.uuid==change.data.uuid);
        RestyTrnHelper.childComponentsChange(change, this._mListSub);
        return this.slidingList.closeSlidingItems();
    }
  }


  /**
   * 
   * @param action 
   */
  async applyChanges(action:string):Promise<IMarker[]> {
    const commitFrom = this._mListSub.value();
    switch(action){
      case "commit":
        const committed = await RestyTrnHelper.commitFromRoot(this.dataService, commitFrom);
        await this.reload(committed);
        return committed;
      case "rollback":
        // return this._mListSub.reload(undefined, false);
        await this.reload();
        return;
    }
  }

}


