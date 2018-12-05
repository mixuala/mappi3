import { Component, ElementRef, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef, ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject, } from 'rxjs';
import { takeUntil, map, switchMap, skipWhile } from 'rxjs/operators';
import { AlertController, ActionSheetController, Content, ModalController } from '@ionic/angular';
import { Plugins } from '@capacitor/core';
import { LaunchNavigator, LaunchNavigatorOptions } from '@ionic-native/launch-navigator/ngx';

import {
  IMarker, IMarkerList, IMarkerGroup, IPhoto, IMapActions, IMarkerLink,
} from '../providers/types';
import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, } from '../providers/mappi/mappi.service';
import  { MockDataService, RestyTrnHelper, quickUuid, } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService,  } from '../providers/photo/photo.service';
import { PhotoswipeComponent } from '../photoswipe/photoswipe.component';
import { GoogleMapsComponent,  } from '../google-maps/google-maps.component';
import { AppConfig, ScreenDim } from '../providers/helpers';
import { HelpComponent } from '../providers/help/help.component';
import { AppCache } from '../providers/appcache';
import { FavoritesPage } from '../favorites/favorites.page';

const { App, Browser, Device } = Plugins;
declare const launchNavigator:any;

@Component({
  selector: 'app-share',
  templateUrl: 'share.page.html',
  styleUrls: ['share.page.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharePage implements OnInit, IViewNavEvents {

  // layout of markerList > markerGroups > markerItems: [edit, default]
  public layout: string;
  public mapSettings: IMapActions = {
    dragend: false,
    click: true,
  }
  public parent: IMarkerList;

  // Observable for MarkerGroupComponent
  public mgCollection$ : Observable<IMarkerGroup[]>;
  // Observable for ScreenDim, used by photoswipe to resize on rotate.
  public screenDim$ = ScreenDim.dim$;
  // Observable for GoogleMapsComponent
  public markerCollection$ : Observable<IMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public qrcodeData: string = null;
  public stash:any = {
    mapLink: null,
    map: null,
  };

  private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string, mgUuids?:string[]}

  private _selectedMarkerGroup: string;
  public get selectedMarkerGroup() { return this._selectedMarkerGroup }
  public set selectedMarkerGroup(value: string) {
    this._selectedMarkerGroup = value;
    // console.warn( "SharePage setter: fire detectChanges() for selected", value);
    setTimeout(()=>this.cd.detectChanges())
  }
    
  // NOTE: used for showing markers on IPhoto[] when photoswipe active
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
        this.mapSettings = {
            dragend: false,
            click: true,
            clickadd: false,
          }
        break;
      case "groups":
        // MappiMarker.reset();
        this.mapSettings = {
          dragend: false,
          click: false,
          clickadd: false,
        }
        this.selectedMarkerGroup = value ? value.uuid : null;
        this.markerCollection$ = this.mgCollection$;
        break;
    }
  }
  private _mgSub: SubjectiveService<IMarkerGroup>;

  @ViewChild(Content) content: Content;
  @ViewChild('contentWrap') contentWrap: ElementRef;

  constructor( 
    public dataService: MockDataService,
    public actionSheetController: ActionSheetController,
    public photoService: PhotoService,
    private router: Router,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef,
    private launchNavigator: LaunchNavigator,
  ){
    this.dataService.ready()
    .then( ()=>{
      this._mgSub = this.dataService.sjMarkerGroups;
    })
    this.gallery = null;
    AppConfig.mapReady.then( map=>{
      this.stash.map = map;  // *ngIf for Share button
      launchNavigator = this.launchNavigator;
    })
  }

  // deprecate
  private _getSubjectForMarkerItems(mg:IMarkerGroup):SubjectiveService<IMarker>{
    return MockDataService.getSubjByParentUuid(mg.uuid);
  }

  getSubjByParentUuid_Watch$ = (uuid:string)=>{
    const found = MockDataService.getSubjByParentUuid(uuid);
    return found && found.watch$();
  }

  async getStaticMap(items?:IMarkerGroup[]){
    await AppConfig.mapReady
    items = items || this._mgSub.value();
    const markers = RestyTrnHelper.getCachedMarkers(items, 'visible');
    this.qrcodeData = GoogleMapsComponent.getStaticMap(AppConfig.map, markers);
    return
  }

  /**
   * launch Apps for more detailed info
   * @param type 
   * @param uuid 
   */
  async launchApp(type:string, uuid:string){
    const launchNavigator = this.launchNavigator;
    const _launchMapWithNavigation = async (marker:IMarker)=>{
      // open map with navigation
      const isAvailable = await launchNavigator.isAppAvailable(launchNavigator.APP.GOOGLE_MAPS);
      const app = isAvailable ? launchNavigator.APP.GOOGLE_MAPS : launchNavigator.APP.USER_SELECT;
      const options:LaunchNavigatorOptions = {
        app: app,
        appSelection:{
          callback: (app)=>console.log("launchApp(): User prefers map app=", app),
          rememberChoice: {enabled:"prompt"},
        }
      }
      const result = await launchNavigator.navigate(marker.loc, options);
      // console.log(result);
    }
    const _launchMapOnly = async (marker:IMarker)=>{
      /**
       * how to set zoom=14 with map?
       * - open map to center,zoom, no marker: 
       *    - https://www.google.com/maps/@3.1602273,101.7369175,14z
       * - marker, no zoom
       *    - https://maps.google.com/?q=@3.1602273,101.7369175
       * - with zoom
       *  - `https://www.google.com/maps/place/${lat},${lng}/@${lat},${lng},${zoom}z`
       *  - https://www.google.com/maps/place/3.1602222,101.734728/@3.1602222,101.734728,14z
       *  - https://www.google.com/maps/place/3°09'36.8"N+101°44'12.9"E/@3.1602222,101.734728,14z
       */
      let URI;
      const {lat, lng} = marker.position;
      const zoom = 14;
      switch (AppConfig.device.platform){
        case 'web':
        case 'android':
          URI = `https://www.google.com/maps/place/${lat},${lng}/@${lat},${lng},${zoom}z`
          this.browserOpen(URI);
          break;
        case 'ios':
          // URI = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&zoom=13`;
          URI = `https://www.google.com/maps/place/${lat},${lng}/@${lat},${lng},${zoom}z`
          const ret = await App.openUrl({ url: URI });
          // console.log('APP: Open url response: ', ret, URI);
          break;
      }
    }

    switch (type){
      case 'Map':
        const marker = this._mgSub.value().find(o=>o.uuid==uuid);
        console.log( "Launch Google Maps to marker.loc=", marker.loc)
        const {lat, lng} = marker.position;
        const here = new google.maps.LatLng(AppConfig.currentLoc.lat, AppConfig.currentLoc.lng);
        const dist = MappiMarker.getDistanceBetween( here, new google.maps.LatLng(lat,lng));
        // console.log("distance from marker=", dist, marker.position, GoogleMapsComponent.currentLoc.toJSON());
        const MAX_NAVIGATION_DISTANCE = 500000;  // meters
        if (dist < MAX_NAVIGATION_DISTANCE && AppConfig.platform.is('cordova')){
          return _launchMapOnly(marker);
          // BUG: google_maps is NOT available
          _launchMapWithNavigation(marker);
        }
        else {
          // just show a pin on a map
          _launchMapOnly(marker);
        }
    }
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

  async browserOpen(url, options:any={}):Promise<void> {
    options.url = url;
    return await Browser.open(options)
  }


  /**
   * set MarkerList position to mapCenter
   * @param mL 
   */
  private _patch_MarkerListPosition(mL:IMarkerList){
    setTimeout( ()=>{
      const {lat, lng} = AppConfig.map.getCenter().toJSON();
      mL.loc = [lat,lng];
      mL.locOffset = [0,0];
      mL.position = MappiMarker.position(mL);
      this.dataService.MarkerLists.put(mL.uuid, mL);
    },1000);
  }

  async ngOnInit() {
    const dontWait = HelpComponent.presentModal(this.modalCtrl, {template:'discover'});

    this.layout = "default";
    const mListId = this.route.snapshot.paramMap.get('uuid');

    // configure subjects and cache
    const mgSubj = MockDataService.getSubjByParentUuid(mListId) || 
      MockDataService.getSubjByParentUuid(mListId, new SubjectiveService(this.dataService.MarkerGroups));
    this._mgSub = mgSubj as SubjectiveService<IMarkerGroup>;

    // for async binding in view
    this.markerCollection$ = this.mgCollection$ = this._mgSub.watch$()
        // NOTE: causes a delay before map loads
        .pipe( 
          takeUntil(this.unsubscribe$),
          skipWhile( ()=>!this.stash.activeView),
          map( items=>{
            this.getStaticMap(items); // update static map with new items
            return items;
          }),
      );

    // initialize subjects
    await Promise.all([this.dataService.ready(), AppConfig.mapReady]);
    this.parent = await this.dataService.MarkerLists.get([mListId]).then( arr=>arr.length ? arr[0] : null);
    if (this.parent && mgSubj.value().length==0)
      mgSubj.get$(this.parent.markerGroupIds);
  }

  viewWillEnter(){
    try {
      this.stash.activeView = true;
      this._mgSub.reload(undefined, false);
      // AppConfig.map.activeView=true;
      console.warn(`viewWillEnter: SharePage`)
    } catch {}
  }

  viewWillLeave(){
    try {
      this.stash.activeView = false;
      // AppConfig.map.activeView=false;
      console.warn(`viewWillLeave: SharePage`);
    } catch {}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }


  /**
   * 
   * @param ev photoswipe gallery
   */
  async openGallery( mg:IMarkerGroup, mi:IPhoto ) {
    const markerGroups = this._mgSub.value();
    const gallery = await PhotoswipeComponent.prepareGallery(markerGroups, mi, this.parent.uuid);

    // // set mgFocus to show markers on Photos
    // const selectedMg = gallery.mgUuids[gallery.index];
    // this.mgFocus = markerGroups.find(o=>o.uuid==selectedMg);
    // // how do you listen for gallery 'destroy` to set this.mgFocus = null;


    this.gallery = gallery;
    this.cd.detectChanges();
    setTimeout( ()=>{
      this.handle_GalleryIndexChange({index:gallery.index, items:gallery.items, uuid:gallery.uuid})
    },500)
    return
  }

  thumbClicked(ev:{mg:IMarkerGroup, mi:IPhoto}){
    this.openGallery(ev.mg, ev.mi);
    this.selectedMarkerGroup = ev.mg.uuid;
  }

  // called by photoswipe on item changed
  handle_GalleryIndexChange(ev:{index:number, items:any[], uuid:string}){
    const isClosing = ev.index===null;
    if (isClosing) {
      return this.mgFocus = null;
    }
    const mgUuid = this.gallery.mgUuids[ev.index];
    if ("map only MarkerGroups" && false) {
      this.selectedMarkerGroup = mgUuid;  // highlight IMarkerGroup marker
    } 
    else if ("map MarkerGroups or Photos") { 
      this.selectedMarkerGroup = ev.items[ev.index]['uuid'];  // highlight IPhoto
      if (mgUuid != this.selectedMarkerGroup){
        // gallery changed to a new MarkerGroup
        // show markers for IPhoto
        const mg = this._mgSub.value().find(o=>o.uuid==mgUuid);
        this.mgFocus = (mg.markerItemIds.length > 1) ? mg : null;
        if (this.mgFocus == null) {
          // go back to mapping MarkerGroups, highlight correct marker
          this.selectedMarkerGroup = mg.uuid;
        }
      }
    }
  }

  async scrollToElement(uuid:string){
    try {
      if (this.gallery) return; // skip if photoswipe gallery open

      
      const i = this._mgSub.value().findIndex(o=>o.uuid==uuid);
      const targets = this.contentWrap.nativeElement.querySelectorAll('APP-MARKER-GROUP');
      const target = targets[i];
      this.content.scrollToPoint(0, target.parentNode['offsetTop'], 500);
    } catch (err) {
      console.warn("ERROR", err);
    }
  }

  // called by GoogleMapComponents, marker click
  handle_MapMarkerSelected(uuid:string){
    if ( this.selectedMarkerGroup == uuid ) {
      console.warn("Testing Native.LaunchNavigator on repeated select")
      this.launchApp('Map', uuid);          
    }
    this.selectedMarkerGroup = uuid;
    this.scrollToElement(uuid);
  }

  handle_MarkerGroupSelected(marker:IMarkerGroup){
    if ( this.selectedMarkerGroup == marker.uuid ) {
      // console.warn("Testing Native.LaunchNavigator on repeated select")
      // this.launchApp('Map', marker.uuid);          
    }
    this.selectedMarkerGroup = marker.uuid;
  }

  /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  async childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    const marker = change.data;
    switch(change.action){
      case 'reload':
        this._mgSub.reload();   // called by action="rollback"
        return;
      case 'selected':
        // invoked by ion-icon[pin](click) from MarkerGroupComponent
        return this.handle_MarkerGroupSelected(marker as IMarkerGroup)
      case 'favorite':
        // DEV: commit immediately
        marker['modified'] = new Date();
        const done = await this._mgSub.resty.put(marker.uuid, marker as IMarkerGroup);
        

        if (marker['_favorite']) {
          const favorite = FavoritesPage.getOrCreateFavorite(marker);
          AppCache.for('Favorite').set( favorite)
        }
        else {
          AppCache.for('Favorite').remove(marker);
        }
        this._mgSub.repeat();
      case 'open-link':
        const link = marker as IMarkerLink;
        this.browserOpen(link.url,{windowName:link.title});
        return;
    }
  }



  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
  }
  private debug(...msg) {
    console.log(msg)
  }


}
