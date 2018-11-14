import { Component, OnInit, Input, Output, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { List, ModalController } from '@ionic/angular';
import { Observable, BehaviorSubject, Subject, fromEventPattern } from 'rxjs';
import { filter, skipWhile, takeUntil, switchMap, map, debounceTime } from 'rxjs/operators';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto, IMapActions,
} from '../providers/types';
import  { 
  MockDataService, RestyTrnHelper, quickUuid,
} from '../providers/mock-data.service';
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
export class ListPage implements OnInit {
  
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
          return mapBounds.contains( new google.maps.LatLng(o.position.lat, o.position.lng));
        })
    } );

    // for async binding in view
    this.mListCollection$ = this._mListSub.watch$()
    .pipe( 
      debounceTime(1000),
      skipWhile( (arr)=>!this.stash.activeView ),
      _filterByMapBounds,
    );

    this.stash.activeView = true;
    // this.stash.CamerarollPage = CamerarollPage;
    
    // for map marker rendering
    this.markerCollection$ = this.mListCollection$
    
    /**
     * search for MarkerLists by mapBounds, or city, or category, etc. 
     * */ 
    this._mListSub.get$();
    setTimeout( ()=>this.handleMapMoved(), 1000);
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
      let items = this._mListSub.value();  // DEV hack
      this._mListSub.next(items);
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
      debounceTime(500),
    ).subscribe( ()=>{
      _searchWhenMapMoves()
    });
  }


  viewWillEnter(){
    try {
      this.stash.activeView = true;
      if ( this.stash.mapPosition ) 
        AppConfig.map.setOptions( this.stash.mapPosition );
      this._mListSub.repeat();
      console.warn("viewWillEnter: ListPage");
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
      const options = {};
      // return CamerarollPage.navPush(options);
      const selected = await CamerarollPage.presentModal(this.modalCtrl);
      console.log( "Create MarkerList from selected=", selected);

      if (!selected.length) return;
      return this.createMarkerList_from_Cameraroll(undefined, selected)
      .then( mL=>{ 
        this.nav('home', mL, {
          queryParams:{
            layout:'edit'
          }
        });
      })
    }

    return this.createMarkerList_from_Camera(undefined)
    .then( mL=>{ 
      this.nav('home', mL, {
        queryParams:{
          layout:'edit'
        }
      });
    })
    
  }



  /**
   * create a new MarkerList from 
   *    1) a map click/location (set the map center) or 
   *    2) CamerarollPage Modal
   * @param ev 
   * @param data 
   */
  async createMarkerList_from_Cameraroll(ev:any={}, data:any={}):Promise<IMarkerList>{
    const target = ev.target && ev.target.tagName;
    const count = this._mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Map created ${item.created.toISOString()}`;
    item.seq = count;

    // create from selected photos
    let photos: IPhoto[] = [];
    if (data instanceof Array) {
      photos = data;
      const bounds = new google.maps.LatLngBounds(null);
      photos.forEach( (p:IPhoto)=>{
        bounds.extend( new google.maps.LatLng(p.loc[0], p.loc[1]));
      });
      const {south, west, north, east} = bounds.toJSON();
      const boundsCenter = [(south+north)/2, (west+east)/2];
      data = {loc: boundsCenter};
    } 
    if (data.loc) data['_loc_was_map_center']==false;

    if (!photos && target=='ION-BUTTON') {
      const photo = await this.photoService.choosePhoto(0);
      photos.push(photo);
    }

    // get position for MarkerList
    let position = await Promise.resolve(data.loc)
    .then(loc=>{
      if (loc) return {lat:loc[0], lng:loc[1]};
      if (AppConfig.map) return AppConfig.map.getCenter().toJSON();
      return AppConfig.currentLoc;
    });

    // create MarkerGroups from each IPhoto[]
    photos.forEach( async (p,i)=>{
      // create MarkerGroup
      const child:IMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup',{seq:i});
      child.label = `Marker created ${child.created.toISOString()}`;
      if (p && p['className']=='Photo') {
        RestyTrnHelper.setFKfromChild(child, p);
        RestyTrnHelper.setFKfromChild(item, child);
      }

      if (MappiMarker.hasLoc(p)) {
        RestyTrnHelper.setLocFromChild(child, p);
      }
      else { 
        RestyTrnHelper.setLocToDefault(child, position);
      }
    });

    // set position of MarkerList
    if (data.loc){ 
      // set by markerClick or selected boundsCenter
      RestyTrnHelper.setLocToDefault(item, position);
      item['_loc_was_map_center'] = false;
    }
    else if (photos && photos[0]) {
      // set by photo with position
      RestyTrnHelper.setLocFromChild(item, photos[0]);
    }
    else RestyTrnHelper.setLocToDefault(item, position);

    // finish up
    RestyTrnHelper.childComponentsChange({data:item, action:'add'}, this._mListSub);
    MockDataService.getSubjByUuid(item.uuid, this._mListSub); // back reference to mListSubj
    return Promise.resolve(item);
  }

  /**
   * create a new MarkerList from 
   *    1) a map click/location (set the map center) or 
   *    2) from the create button,
   *  specifying either a selected image or mapCenter as the marker location
   * use this.photoService.choosePhoto(0) to select photo
   * @param data IMarker properties, specifically [loc | seq]
   * @param ev click event
   * 
   */
  async createMarkerList_from_Camera(ev:any={}, data:any={}):Promise<IMarkerList>{
    const target = ev.target && ev.target.tagName;
    const count = data.seq || this._mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Map created ${item.created.toISOString()}`;
    item.seq = count;
    const child:IMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    child.label = `Marker created ${child.created.toISOString()}`;
    child.seq = 0;
    return Promise.resolve(true)
    .then ( ()=>{
      if (target=='ION-BUTTON') {
        return this.photoService.choosePhoto(0)
        .then( (p:IPhoto)=>{

          console.log( "### ListPage.choosePhoto, photo=",p, AppCache.for('Cameraroll').get(p.camerarollId))

          RestyTrnHelper.setFKfromChild(child, p);
          RestyTrnHelper.setFKfromChild(item, child);
          if (MappiMarker.hasLoc(p)) {
            RestyTrnHelper.setLocFromChild(child, p);
            RestyTrnHelper.setLocFromChild(item, child);
            return;
          }
          // WARN: selected photo does not include GPS loc
          return Promise.reject("continue");
        })
      }
      return Promise.reject('continue');
    })
    .catch( (err)=>{
      if (err=='continue') {
        // no IPhoto returned, get a placeholder
        return Promise.resolve(true)
        .then( async ()=>{
          let position = AppConfig.map && AppConfig.map.getCenter();
          if (position) 
            return position;
          else 
            return GoogleMapsHostComponent.getCurrentPosition();
        })
        .then( (latlng:google.maps.LatLng)=>{
          const position = latlng.toJSON();
          RestyTrnHelper.setLocToDefault(item, position);
          RestyTrnHelper.setLocToDefault(child, position);
          return item;
        })
      }
      console.warn('ListPage.createMarkerGroup()',err);
    }) 
    .then( ()=>{
      RestyTrnHelper.childComponentsChange({data:item, action:'add'}, this._mListSub);
      MockDataService.getSubjByUuid(item.uuid, this._mListSub); // back reference to mListSubj
      return item;
    });
  }




  // called by GoogleMapComponents, marker click
  handle_MapMarkerSelected(uuid:string){
    this.selectedMarkerList = uuid;
    this.nav('map', {uuid} as IMarkerList )
  }



  /*
   * additional event handlers, possibly called from @ViewChilds
   */
  childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    const mLists = this._mListSub.value();
    switch(change.action){
      case 'selected':
        return this.selectedMarkerList = change.data.uuid;
      case 'prompt':
        // Prompt.getText() already committed, just reload
        return this._mListSub.reload();
      case 'remove':
        const item:IRestMarker = mLists.find(o=>o.uuid==change.data.uuid);
        RestyTrnHelper.childComponentsChange(change, this._mListSub);
        return this.slidingList.closeSlidingItems();
    }
  }


  /**
   * 
   * @param action 
   */
  async applyChanges(action:string):Promise<IMarker[]> {
    const commitSubj: SubjectiveService<IRestMarker> = this._mListSub;
    switch(action){
      case "commit":
        const committed = await RestyTrnHelper.applyChanges(action, commitSubj, this.dataService);
        return committed;
      case "rollback":
        return this._mListSub.reload(undefined, false);
    }
  }

}


