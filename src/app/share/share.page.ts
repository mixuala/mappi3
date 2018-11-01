import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef, ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject, Subscription } from 'rxjs';
import { takeUntil, switchMap, skipWhile } from 'rxjs/operators';
import { AlertController, ActionSheetController } from '@ionic/angular';
import { Plugins } from '@capacitor/core';
import { LaunchNavigator, LaunchNavigatorOptions } from '@ionic-native/launch-navigator/ngx';

import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';
import  { MockDataService, RestyTrnHelper, quickUuid,
  IMarkerGroup, IPhoto, IMarker, IRestMarker, IMarkerList,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';
import { GoogleMapsComponent, IMapActions } from '../google-maps/google-maps.component';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { ImgSrc, IImgSrc } from '../providers/photo/imgsrc.service';
import { ScreenDim, AppConfig } from '../providers/helpers';

const { App, Browser, Device } = Plugins;
declare const launchnavigator:any;

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
  public stash:any = {};

  private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string, mgUuids?:string[]}

  private _selectedMarkerGroup: string;
  public get selectedMarkerGroup() { return this._selectedMarkerGroup }
  public set selectedMarkerGroup(value: string) {
    this._selectedMarkerGroup = value;
    // console.warn( "SharePage setter: fire detectChanges() for selected", value);
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
        if ( this.selectedMarkerGroup == value.uuid ) {
          console.warn("Testing Native.LaunchNavigator on repeated select")
          this.launchApp('Map', value.uuid);          
        }
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
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
    private launchNavigator: LaunchNavigator,
  ){
    this.dataService.ready()
    .then( ()=>{
      this._mgSub = this.dataService.sjMarkerGroups;
    })
    this.gallery = null;
  }

  private _getSubjectForMarkerItems(mg:IMarkerGroup):SubjectiveService<IMarker>{
    return MockDataService.getSubjByParentUuid(mg.uuid);
  }

  getSubjByParentUuid_Watch$ = (uuid:string)=>{
    const found = MockDataService.getSubjByParentUuid(uuid);
    return found && found.watch$();
  }

  getStaticMap(){
    const markers = RestyTrnHelper.getCachedMarkers(this._mgSub.value(), 'visible');
    this.qrcodeData = GoogleMapsComponent.getStaticMap(AppConfig.map, markers);
    return
  }

  /**
   * launch Apps for more detailed info
   * @param type 
   * @param uuid 
   */
  async launchApp(type:string, uuid:string){
    const _launchMapWithNavigation = async (marker:IMarker)=>{
      // open map with navigation
      // const isAvailable = await this.launchNavigator.isAppAvailable(launchnavigator.APP.GOOGLE_MAPS);
      // const app = isAvailable ? launchnavigator.APP.GOOGLE_MAPS : launchnavigator.APP.USER_SELECT;
      const options:LaunchNavigatorOptions = {
        app: launchnavigator.APP.USER_SELECT,
        appSelection:{
          callback: (app)=>console.log("launchApp(): User prefers map app=", app),
          rememberChoice: {enabled:"prompt"},
        }
      }
      const result = await this.launchNavigator.navigate(marker.loc, options);
      // console.log(result);
    }
    const _launchMapOnly = async (marker:IMarker)=>{
      let URI;
      const {lat, lng} = marker.position;
      switch (AppConfig.device.platform){
        case 'web':
        case 'android':
          URI = `https://maps.google.com/?q=@${lat},${lng}`;
          this.browserOpen(URI);
          break;
        case 'ios':
          // URI = `comgooglemapsurl://maps.google.com/?q=@${lat},${lng}`;
          URI = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&zoom=15`;
          const ret = await App.openUrl({ url: URI });
          // console.log('APP: Open url response: ', ret, URI);
          break;
      }
    }

    switch (type){
      case 'Map':
        const marker = this._mgSub.value().find(o=>o.uuid==uuid);
        console.log( "Launch Google Maps to marker.loc=", marker.loc)
        const calcDistanceBetween = google.maps.geometry.spherical.computeDistanceBetween;
        const {lat, lng} = marker.position;
        const dist = calcDistanceBetween(GoogleMapsHostComponent.currentLoc, new google.maps.LatLng(lat,lng));
        // console.log("distance from marker=", dist, marker.position, GoogleMapsComponent.currentLoc.toJSON());
        const MAX_NAVIGATION_DISTANCE = 500000;  // meters
        if (dist < MAX_NAVIGATION_DISTANCE){
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

  async browserOpen(url):Promise<void> {
    return await Browser.open({url:url})
  }

  async ngOnInit() {
    this.layout = "default";
    const mListId = this.route.snapshot.paramMap.get('uuid');

    // configure subjects and cache
    const mListSubj = MockDataService.getSubjByUuid(mListId) || 
      MockDataService.getSubjByUuid(mListId, new SubjectiveService(this.dataService.MarkerLists));
    const mgSubj = MockDataService.getSubjByParentUuid(mListId) || 
      MockDataService.getSubjByParentUuid(mListId, new SubjectiveService(this.dataService.MarkerGroups));
    this._mgSub = mgSubj as SubjectiveService<IMarkerGroup>;

    // for async binding in view
    this.markerCollection$ = this.mgCollection$ = this._mgSub.watch$()
        .pipe( skipWhile( ()=>!this.stash.activeView) );
        // NOTE: causes a delay before map loads

    // initialize subjects
    await Promise.all([this.dataService.ready(), AppConfig.mapReady]);
    this.parent = mListSubj.value().find( o=>o.uuid==mListId) as IMarkerList;
    if (!this.parent){
      // initializers for deep-linking
      const done = mListSubj.get$([mListId]).pipe(
        switchMap( (o)=>{
          if (o.length) {
            this.parent = o[0] as IMarkerList;
            this.stash.activeView = true;
            return mgSubj.get$(this.parent.markerGroupIds);
          } 
          return Observable.create();
        })).subscribe( ()=>{
          if (this.parent)
            done.unsubscribe();
        })
    }

  }

  viewWillEnter(){
    try {
      this._mgSub.reload();
      this.stash.activeView = true;
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

    const items:PhotoSwipe.Item[] = [];
    const mgUuids:string[] = []; // index lookup to MarkerGroup.uuid
    const mgs = this._mgSub.value();
    const screenDim = await ScreenDim.dim;
    // get all photos for all markerGroups in this markerList
    const waitFor:Promise<void>[] = [];
    let found:number;
    mgs.forEach( mg=>{
      const mgPhotos_subject = this._getSubjectForMarkerItems(mg);
      mgPhotos_subject.value().forEach( (p:IPhoto)=>{
        waitFor.push(
          new Promise( async (resolve, reject)=>{
            const fsDim = await ImgSrc.scaleDimToScreen(p, screenDim);
            const [imgW, imgH] = fsDim.split('x');
            const done = ImgSrc.getImgSrc$(p, fsDim)
            .subscribe( (fsSrc:IImgSrc)=>{
              if (!fsSrc.src) return;
              const item = {
                src: fsSrc.src,
                w: parseInt(imgW),
                h: parseInt(imgH),
              }; 
              item['uuid'] = p.uuid;
              items.push(item);
              mgUuids.push(mg.uuid);
              if (p.uuid == mi.uuid) found = items.length-1;
              done && done.unsubscribe();
              resolve();
            });

          })
        );
      });
    });
    await Promise.all(waitFor);
    const index = found || 0;
    const uuid = this.parent.uuid;
    this.gallery = {items, index, uuid, mgUuids};
    this.cd.detectChanges();
  }

  thumbClicked(ev:{mg:IMarkerGroup, mi:IPhoto}){
    this.openGallery(ev.mg, ev.mi);
  }


  focusMarker(ev:{index:number, items:any[], uuid:string}){
    this.selectedMarkerGroup = this.gallery.mgUuids[ev.index];
  }



  /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  async childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    const marker = change.data;
    switch(change.action){
      case 'selected':
        return this.selectedMarkerGroup = change.data.uuid;
      case 'favorite':
        // DEV: commit immediately
        marker['modified'] = new Date();
        const done = await this._mgSub.resty.put(marker.uuid, marker as IMarkerGroup);
        this._mgSub.reload();
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
