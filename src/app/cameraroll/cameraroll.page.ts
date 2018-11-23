import { Component, Input, OnInit,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject, ReplaySubject } from 'rxjs';
import { map, skipWhile, takeUntil, } from 'rxjs/operators';


import { 
  IMarkerList, IMarkerGroup, IPhoto, 
  IMoment, IExifPhoto, IMappiLibraryItem, IMappiGetLibraryOptions, IMappiGetThumbnailOptions, IChoosePhotoOptions,
} from '../providers/types'
import { PhotoService, PhotoLibraryHelper, } from '../providers/photo/photo.service';
import { ImgSrc, } from '../providers/photo/imgsrc.service';
import  { MockDataService, RestyTrnHelper, quickUuid } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { AppCache } from '../providers/appcache';
import { AppConfig } from '../providers/helpers';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { HelpComponent } from '../providers/help/help.component';




// config constants
const USE_ION_VIRTUAL_SCROLL = true;




@Component({
  selector: 'app-cameraroll',
  templateUrl: './cameraroll.page.html',
  styleUrls: ['./cameraroll.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CamerarollPage implements OnInit {

  /**
   * ion-nav-push adds <app-cameraroll> as a child of <ion-nav>
   * - allows for a richer nav stack outside the router-outlet
   * - outside <ion-router-outlet>
   * see: https://github.com/ionic-team/ionic/tree/master/core/src/components/nav
   * @param options 
   */
  static async navPush(options?:any):Promise<IPhoto[]>{
    const nav = document.querySelector('ion-nav');
    await nav.componentOnReady();
    nav.classList.add('activated');
    options = Object.assign( {isNav:true}, options );
    return new Promise<IPhoto[]>( resolve=>{
      nav.push(CamerarollPage, options);
    });
  }

  /**
   * launch as Modal
   * @param modalCtrl 
   * @param options options.onDismiss:(resp:{selected:IPhoto[], mapping:{[uuid:string]:IMoment}})=>Promise<void>
   */
  static async presentModal(modalCtrl:ModalController, options?:any):Promise<any>{

    options = Object.assign( {isModal:true}, options );
    return modalCtrl.create({
      component: CamerarollPage,
      componentProps: options,
    })
    .then( async (modal) => {
      modal.classList.add('cameraroll-modal');  
      modal.present();
      await modal.onWillDismiss().then( async (resp)=>{
        if (resp.data.selected && resp.data.selected.length){
          // commit before dismissing modal
          // console.log(resp);
          return options.onDismiss && options.onDismiss(resp.data);
        }
      })
      return modal.onDidDismiss();
    });
  }

  // detect launch mode to set appropriate dismiss()
  rowHeight:number;
  isModal:boolean = false;
  isNav:boolean = false;
  layout:string = "cameraroll"; // enum=[gallery, list, edit, focus-marker-group]
  stash:any = {};

  public momSubject: BehaviorSubject<IMoment[]>;
  public momCollection$: Observable<IMoment[]>;

  public miSubject: BehaviorSubject<IPhoto[]>;
  public miCollection$: Observable<IPhoto[]>;
  public miRowCollection$: Observable<IPhoto[][]>;
  public unsubscribe$ : Subject<boolean>;

  @Input() items:IPhoto[] | IMappiLibraryItem[];

  constructor(
    public dataService: MockDataService,
    private route: ActivatedRoute,
    public photoService: PhotoService,
    private router: Router,
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef,
  ) {}


  async loadCameraroll( columns:number=4 ){
    const [screenW,h] = AppConfig.screenWH;
    // ip8+ screenW=414
    const CAMERAROLL_ROW_HEIGHT = (screenW<414) ? 90 : 100;
    this.stash.useVirtualScroll = USE_ION_VIRTUAL_SCROLL;
    if (USE_ION_VIRTUAL_SCROLL) {
      this.stash.rowHeight = CAMERAROLL_ROW_HEIGHT + 4;
      this.stash.headerHeight = 80 + 4 + 0.01;
      // match --cameraroll-row-h: 90px;
      this.stash.columns = Math.floor((screenW+4)/this.stash.rowHeight);
      this.stash.dim = [CAMERAROLL_ROW_HEIGHT,CAMERAROLL_ROW_HEIGHT].join('x');
      this.stash.imgStyle={'width.px':CAMERAROLL_ROW_HEIGHT, 'height.px':CAMERAROLL_ROW_HEIGHT};
    }
    else {
      // use masonry 
      this.stash.rowHeight = 100;
      // --masonry-row-h: 100px;
      this.stash.dim = 'x100';
    }

    
    let moments: IMoment[];
    let allPhotos:IPhoto[] = []
    const options = {};
    switch (AppConfig.device.platform) {
      case "ios":
      [moments, allPhotos] = await this.ios_prepare_Cameraroll();
      case "web":
      case "android":
        // load mock cameraroll, direct assignment, does not use ngOnChanges();
        moments = await this.mockCamerarollAsMoments(options);
        moments.forEach(m=>{
          this.humanize(m);
          const notFound = [];
          let photos = m['photos'] as IPhoto[];  // for view rendering
          if (photos){
            // from mockCamerarollAsMoments()
            m._itemSubj = new BehaviorSubject<IPhoto[]>(photos);
            m._items$ = m._itemSubj.asObservable();
            photos.forEach( p=>{
              p['_isSelected'] = false;
              p['_isFavorite'] = p['_isFavorite'] || false;
              p._imgSrc$=ImgSrc.getImgSrc$(p, this.stash.dim, false);
              p['_moment'] = m;                 // for renderMomentAsHeaderFn
              allPhotos.push(p);
            })
          }
          AppCache.for('Moment').set(m);
        });
        break;
    }

    /**
     * show cameraroll
     */
    this.miSubject.next(allPhotos);
    this.momSubject.next(moments);              
  }

  /**
   * get moments from cameraroll, 
   * @param minDist , filter by minimum distance in meters
   * @param minCount , filter by minimum items in moment
   */
  async ios_loadMoments(minDist?:number, minCount?:number):Promise<IMoment[]>{
    if (AppConfig.device.platform != 'ios') return [];

    let moments = await this.photoService.scan_moments_PhotoLibrary_Cordova({daysAgo:180});
    if (moments.length==0){
      return this.patch_ios_emulator_cameraroll()
    }
    if (minCount) moments = moments.filter( m=>{
      return m.itemIds.length >= minCount;
      return (m._itemSubj as BehaviorSubject<IPhoto[]>).value.length >= minCount;
    });
    if (minDist) {
      moments = moments.filter( m=>{
        return m.loc && MappiMarker.getDistanceBetween(m.loc, AppConfig.currentLoc)>=minDist;
      });
    }
    return Promise.resolve(moments);
  }

  async ios_prepare_Cameraroll():Promise<[IMoment[], IPhoto[]]>{
      let moments: IMoment[];
      const allPhotos:IPhoto[] = []
      const options = {};
      moments = await this.ios_loadMoments(500*1000, 3);
      moments = moments.sort( (a,b)=>a.startDate > b.startDate ? 1 : -1).reverse();
      moments.forEach(m=>{
        this.humanize(m);
        const notFound = [];

        // from `ios` cameraRoll
        const photos = m.itemIds.reduce( (res,id)=>{
          const item = AppCache.for('Cameraroll').get(id);
          if (!item) {
            notFound.push(id);
            return res;
          }
          // TODO: not sure we should cache Photos from Cameraroll
          const p = PhotoLibraryHelper.libraryItem2Photo(item, true);
          p['_isSelected'] = false;
          p['_isFavorite'] = p['_isFavorite'] || false;
          p['_moment'] = m;                 // for renderMomentAsHeaderFn
          res.push(p);
          allPhotos.push(p);
          return res; 
        },[]);

        m._itemSubj = new BehaviorSubject<IPhoto[]>(photos);
        m._items$ = m._itemSubj.asObservable();

        function _dontWait(){
          // dont wait for requests to Cameraroll
          const waitFor:Promise<IPhoto>[] = notFound
          .slice(0,10)
          .map( (id)=>{
            return PhotoLibraryHelper.getLibraryItemFromCameraRoll(id)
            .then( item=>{
              if (!item) return;
              const p = PhotoLibraryHelper.libraryItem2Photo(item, true);
              p['_isSelected'] = false;
              p['_isFavorite'] = p['_isFavorite'] || false;
              p['_moment'] = m;                 // for renderMomentAsHeaderFn
              return p;
            });
          });
          Promise.all(waitFor).then((photos)=>{
            const found = photos.filter( p=>!!p );
            if (!found.length) return;

            const cached = AppCache.for('Photo').items();
            const ready = m.itemIds.map( id=>cached.find(o=>o.camerarollId==id) );
            m._itemSubj.next( ready.filter(o=>!!o) );
          });
          return;
        }

        _dontWait();  // end forEach
        return;
      });

      // load ImgSrc by Observable
      allPhotos.slice(0,99).forEach( p=>{
        /**
         * needs rate control or lazy loading for cameraroll
         * otherwise too slow
         */
        setTimeout( ()=>p._imgSrc$=ImgSrc.getImgSrc$(p, this.stash.dim, false) ,10 );

      }); 
      return [moments, allPhotos];
  }

  async ngOnInit() {

    const dontWait = HelpComponent.presentModal(this.modalCtrl, {template:'cameraroll'});

    this.stash.activeView = true;
    this.unsubscribe$ = new Subject<boolean>();
    this.momSubject = new BehaviorSubject<IMoment[]>([]);
    this.momCollection$ = this.momSubject.asObservable();

    this.miSubject = new BehaviorSubject<IPhoto[]>([]);
    this.miCollection$ = this.miSubject.asObservable();
    this.miRowCollection$ = this.miSubject.pipe( 
        takeUntil(this.unsubscribe$),
        skipWhile( (arr)=>!this.stash.activeView || arr.length==0),
        map( (photos)=>{
          // rows of up to 4 columns per moment
          const chunked:IPhoto[][] = [[]];
          photos.forEach( (p,i,arr)=>{
            let isNewMoment = false;
            if (i==0) isNewMoment = true;
            if ( i>0 && (p['_moment'] != arr[i-1]['_moment']) ) isNewMoment = true;
            let lastrow:IPhoto[] = chunked[chunked.length-1];
            if (isNewMoment && lastrow.length) lastrow = [];
            if (lastrow.length>=this.stash.columns) lastrow = [];
            if (chunked[chunked.length-1]!==lastrow) chunked.push(lastrow);
            lastrow.push(p);
          });
          return chunked;
        }), 
      );
    this.loadCameraroll( );
  }

  async viewWillEnter(){
    this.stash.activeView = true;
    this.loadCameraroll();
  }

  viewWillLeave(){
    this.stash.activeView = false;
    // is NOT called by this["modal"].dismiss(selected)
    console.log("CamerarollPage ViewWillLeave");
    // reset all selected
    this.miSubject.value.forEach(o=>o['_isSelected']=false);
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }

  /**
   * for ion-virtual-scroll headerFn
   * @param p:IPhoto 
   * @param i 
   * @param arr 
   */
  renderMomentAsHeaderFn(p:IPhoto | IPhoto[], i, arr):IMoment{
    try {
      const photo = p instanceof Array ? p[0] : p;
      let showHeader = false;
      if (i==0) showHeader = true;
      else {
        const prev = p instanceof Array ? arr[i-1][0] : arr[i-1];
        if ( photo['_moment'].id != prev['_moment'].id ) showHeader = true;
      }
      return (showHeader) ? photo['_moment'] : null;
    } catch(err){
      return null;
    }
  }


  async commit():Promise<{ selected:IPhoto[] }> {
    const selected = this.miSubject.value.filter(o=>o['_isSelected']);
    const data = {selected};
    
    if (this.isModal || this["modal"] ) {
      await this["modal"].dismiss(data);  // pass selected back to opener
      return;
    }
    if (this.isNav) {
      return Promise.resolve(data);
    }
    // router-outlet nav from sidemenu, create MarkerList from selection, only
    const mL = await CamerarollPage.createMarkerList_from_Cameraroll(selected, this.dataService.sjMarkerLists);
    AppCache.for('Key').set(mL, mL.uuid)
    this.router.navigate(['home', mL.uuid], {queryParams:{layout:'edit'}});
    return;
  }


  async close() {
    if (this.isModal || this["modal"] ) {
      this["modal"].dismiss([]);
      return;
    }

    if (this.isNav) {
      this.miSubject.next([]);  // reset view, not required for modal
      const nav = document.querySelector('ion-nav');
      nav.classList.remove('activated');
      if (nav.canGoBack()) 
        return nav.pop();
    }
    return this.router.navigate(['/list'])
  }

  /**
   * NOTE: Page behavior does not get data through @Input
   */
  ngOnChanges(){

  }

  thumbClicked(item:IPhoto|IMappiLibraryItem){
    console.log("Cameraroll selected, item=", item);
  }

  toggle(ev:Event, item:IPhoto, action:string){
    ev.stopImmediatePropagation();
    switch (action){
      case 'favorite': item['_isFavorite'] = !item['_isFavorite']; break;
      case 'selected': item['_isSelected'] = !item['_isSelected']; break;
    }
    this.cd.detectChanges();
  }


  public static createMarkerList_from_Cameraroll(selected:IPhoto[], mListSub: SubjectiveService<IMarkerList>):Promise<IMarkerList>{

    // function _getMomentsFromPhoto(photos):{[uuid:string]:IMoment}{
    //   return photos.reduce( (res,p)=>{
    //     const found = AppCache.for('Moment').items().find( m=>m.itemIds.includes( p.uuid) );
    //     if (found) res[p.uuid] = found;
    //     return res;
    //   }, {});
    // }

    if (!selected || selected.length==0) 
      return Promise.resolve(null);

    const count = mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Trip created ${item.created.toISOString()}`;
    item.seq = count;

    // create from selected photos
    let photos = selected;
    const bounds = new google.maps.LatLngBounds(null);
    photos.forEach( (p:IPhoto)=>{
      bounds.extend( new google.maps.LatLng(p.loc[0], p.loc[1]));
    });

    // create IPhoto < IMarkerGroup < IMarkerList
    let mList_position;
    const momentsById = photos.reduce((res,p)=>{
      res[p['_moment'].id]=false;
      return res;
    },{} );
    photos.forEach( async (p,i)=>{
      const moment = p['_moment'];
      // create MarkerGroup
      let mg:IMarkerGroup;
      if (Object.keys(momentsById).length >1){
        // each moment => MarkerGroup, photos from same moment grouped by MarkerGroup
        const count = item.markerGroupIds.length;
        momentsById[moment.id] = momentsById[moment.id] || RestyTrnHelper.getPlaceholder('MarkerGroup',{seq:count});
        mg = momentsById[moment.id];
      } 
      else mg = RestyTrnHelper.getPlaceholder('MarkerGroup',{seq:i});

      if (moment) {
        if (i==0) item.label = moment.title || moment.locations;
        mg.label = moment.title || moment.locations;
      } 
      else mg.label = `Marker created ${mg.created.toISOString()}`;
      
      if (p && p['className']=='Photo') {
        RestyTrnHelper.setFKfromChild(mg, p);
        RestyTrnHelper.setFKfromChild(item, mg);
      }

      if (MappiMarker.hasLoc(p)) {
        RestyTrnHelper.setLocFromChild(mg, p);
        mList_position = mList_position || p.position;
      }
      else { 
        // get default position for MarkerList
        let latlng = AppConfig.map && AppConfig.map.getCenter();
        if (!latlng) 
          latlng = await GoogleMapsHostComponent.getCurrentPosition();
        const position = latlng.toJSON();
        mList_position = mList_position || position;
        RestyTrnHelper.setLocToDefault(mg, position);
      }
    });

    // set position of MarkerList
    if (photos && photos[0]) {
      // set by photo with position
      RestyTrnHelper.setLocFromChild(item, photos[0]);
    }
    else {
      RestyTrnHelper.setLocToDefault(item, mList_position);
    }

    // finish up
    RestyTrnHelper.childComponentsChange({data:item, action:'add'}, mListSub);
    return Promise.resolve(item);
  }








  /**
   * helpers
   */
  ionImgLoaded($event){
    $event.currentTarget.classList.add('img-loaded')
  }

  async patch_ios_emulator_cameraroll():Promise<IMoment[]>{
      // patch for emulators with no moments
      console.warn(`&&& Cameraroll: patch moments for emulators`);
      const allPhotos:IPhoto[] = [];
      const items = await this.photoService.load_PhotoLibraryByChunk(100);
      const moment = {
        id: quickUuid(),
        title: "Cameraroll",
        locations: "",
        itemIds: items.map(o=>o.id),
        startDate: new Date().toISOString(),
        endDate: null,
      };
      return Promise.resolve([moment]);
  }

  humanize(moment:IMoment):IMoment{
    moment['label'] = moment.title || moment.locations;
    moment['begins'] = new Date(moment.startDate).toDateString();
    moment['days'] = Math.ceil( (new Date(moment.endDate).valueOf() - new Date(moment.startDate).valueOf()) / (24*3600*1000) );
    moment['count'] = moment.itemIds.length;
    return moment;
  }


  /**
   * add location/dateTaken data to emulate moments
   * @param options 
   */
  mockCamerarollAsMoments(options:any={}):Promise<IMoment[]>{
    const cached = AppCache.for('Moment').items()
    if (cached.length) return Promise.resolve(cached);

    let index = 0;
    const moments:IMoment[] = [BANGKOK_LOCATIONS, SIEMREAP_LOCATIONS]
    .map( o=>JSON.parse(o))
    .map( locs=>{
      return locs.map( loc=>{

        const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo',{loc});
        const p = MockDataService.inflatePhoto(emptyPhoto, index, index);
        // add loc and dateTaken
        return p;
      })
    })
    .map( (photos:IPhoto[])=>{
      const bounds = new google.maps.LatLngBounds(null);
      photos.forEach( (p:IPhoto)=>{
        bounds.extend( new google.maps.LatLng(p.loc[0], p.loc[1]));
        p['_isSelected'] = false;
        p['_isFavorite'] = false;
      });
      const id = quickUuid();
      const title = "";
      const locations:string = "";
      const dates = photos.map(o=>o.dateTaken).sort();
      const startDate = dates[0];
      const endDate = dates.pop();
      const itemIds = photos.map(o=>o.uuid);
      return { id, title, locations, startDate, endDate, itemIds, photos, bounds,}
    });

    // manually patch locations
    moments[0].locations = ["Bangkok", "Thailand"].join(', ');
    moments[1].locations = ["Siem Reap", "Cambodia"].join(', ');

    // filter bounds/dateTaken
    if (options.from || options.to) {
      // filter by dateTaken
    }
    if (options.bounds) {
      // filter by bounds
    }

    // convert to IPhoto for display
    return Promise.resolve(moments);
  }

}


const BANGKOK_LOCATIONS = "[[13.741533333333333,100.51091166666667],[13.741596666666666,100.51078],[13.741283333333334,100.51111666666667],[13.74233,100.50996333333333],[13.741521666666667,100.51093333333333],[13.74085,100.50882833333333],[13.73978,100.51091666666667],[13.742338333333333,100.51007833333334],[13.739928333333333,100.51108666666667],[13.742363333333333,100.50982],[13.740555,100.50953666666666],[13.741346666666667,100.51113833333334],[13.740146666666666,100.51078833333334],[13.741533333333333,100.51091166666667],[13.740136666666666,100.51077166666667],[13.741728333333333,100.51064166666667]]";
const SIEMREAP_LOCATIONS = "[[13.446105,103.87355833333334],[13.598763333333334,103.96305833333334],[13.412071666666666,103.866395],[13.412621666666666,103.867295],[13.3496,103.85703333333333],[13.426683333333333,103.855995],[13.44587,103.87310833333333],[13.598863333333334,103.96443],[13.412308333333334,103.866775],[13.412413333333333,103.86676666666666],[13.434846666666667,103.88944166666667],[13.412071666666666,103.86640833333334],[13.434608333333333,103.88921333333333],[13.349453333333333,103.85739166666667],[13.419921666666667,103.863],[13.412738333333333,103.86358666666666],[13.598936666666667,103.96396666666666],[13.427303333333333,103.84525333333333],[13.349496666666667,103.85738333333333],[13.598845,103.96324166666666],[13.43477,103.88894666666667],[13.412353333333334,103.86615833333333],[13.43482,103.88952],[13.350228333333334,103.863755],[13.426766666666667,103.85607166666667],[13.598905,103.96357],[13.46458,103.91323833333334],[13.441028333333334,103.84664166666667],[13.4267,103.85952833333333]]";