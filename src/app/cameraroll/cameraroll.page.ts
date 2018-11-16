import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject, ReplaySubject } from 'rxjs';


import { 
  IPhoto, 
  IMoment, IExifPhoto, IMappiLibraryItem, IMappiGetLibraryOptions, IMappiGetThumbnailOptions, IChoosePhotoOptions,
} from '../providers/types'
import { PhotoService, PhotoLibraryHelper, } from '../providers/photo/photo.service';
import { ImgSrc, } from '../providers/photo/imgsrc.service';
import  { MockDataService, RestyTrnHelper, quickUuid } from '../providers/mock-data.service';
import { AppCache } from '../providers/appcache';
import { ModalController } from '@ionic/angular';
import { AppConfig } from '../providers/helpers';

@Component({
  selector: 'app-cameraroll',
  templateUrl: './cameraroll.page.html',
  styleUrls: ['./cameraroll.page.scss'],
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
   * @param options options.onDismiss:(selected:IPhoto[])=>Promise<void>
   */
  static async presentModal(modalCtrl:ModalController, options?:any):Promise<any>{
      options = Object.assign( {isModal:true}, options );
      return modalCtrl.create({
        component: CamerarollPage,
        componentProps: options,
      })
      .then( async (modal) => {
        modal.present();
        await modal.onWillDismiss().then( async (resp)=>{
          if (resp.data.length){
            // commit before dismissing modal
            return options.onDismiss && options.onDismiss(resp.data);
          }
        })
        return modal.onDidDismiss();
      });
  }

  // detect launch mode to set appropriate dismiss()
  isModal:boolean = false;
  isNav:boolean = false;
  layout:string = "cameraroll"; // enum=[gallery, list, edit, focus-marker-group]
  stash:any = {};

  public momSubject: BehaviorSubject<IMoment[]>;
  public momCollection$: Observable<IMoment[]>;

  public miSubject: BehaviorSubject<IPhoto[]>;
  public miCollection$: Observable<IPhoto[]>;

  @Input() items:IPhoto[] | IMappiLibraryItem[];

  constructor(
    private route: ActivatedRoute,
    public photoService: PhotoService,
    private router: Router,
  ) { }


  async loadCameraroll(){
    const dim = "x160";  // height==160
    switch (AppConfig.device.platform) {
      case "ios":
        const options = {};
        let photos = await this.photoService.getCamerarollAsPhotos(options);
        if (photos.length) break;
      case "web":
      case "android":
        // load mock cameraroll, direct assignment, does not use ngOnChanges();
        const moments = await this.mockCamerarollAsMoments(options);
        const allPhotos: IPhoto[] = [];
        moments.forEach(m=>{
          this.humanize(m);
          m.photos.forEach( mi=>{
            allPhotos.push(mi);
            if (!mi._imgSrc$){
              mi['imgSrc$']= ImgSrc.getImgSrc$(mi, dim);
              mi['_isSelected'] = false;
              mi['_isFavorite'] = false;
            }
          })
        });
        this.momSubject.next(moments);
        this.miSubject.next(allPhotos);
        break;
    }
  }

  async ngOnInit() {
    this.momSubject = new BehaviorSubject<IMoment[]>([]);
    this.momCollection$ = this.momSubject.asObservable();

    this.miSubject = new BehaviorSubject<IPhoto[]>([]);
    this.miCollection$ = this.miSubject.asObservable();

    this.loadCameraroll();
  }

  async viewWillEnter(){
    this.loadCameraroll();
  }

  viewWillLeave(){
    // is NOT called by this["modal"].dismiss(selected)
    console.log("CamerarollPage ViewWillLeave");
    // reset all selected
    this.miSubject.value.forEach(o=>o['_isSelected']=false);
  }


  async commit():Promise<IPhoto[]> {
    const selected = this.miSubject.value.filter(o=>o['_isSelected']);

    if (this.isModal || this["modal"] ) {
      await this["modal"].dismiss(selected);  // pass selected back to opener
    }
    if (this.isNav) {
      // ???: how to do pass `selected` back to the listener?
      return Promise.resolve(selected);
    }
    this.close();
  }


  async close() {
    if (this.isModal || this["modal"] ) {
      this["modal"].dismiss([]);
    }

    if (this.isNav) {
      this.miSubject.next([]);  // reset view, not required for modal
      const nav = document.querySelector('ion-nav');
      nav.classList.remove('activated');
      if (nav.canGoBack()) 
        return nav.pop();
    }
    return
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
      case 'favorite': return item['_isFavorite'] = !item['_isFavorite'];
      case 'selected': return item['_isSelected'] = !item['_isSelected']; 
    }
  }






  /**
   * helpers
   */
  humanize(moment:IMoment):IMoment{
    moment['label'] = moment.locations.join(', ');
    moment['begins'] = moment.startDate.toDateString();
    moment['days'] = Math.ceil( (moment.endDate.valueOf() - moment.startDate.valueOf()) / (24*3600*1000) );
    moment['count'] = moment.itemIds.length;
    return moment;
  }


  /**
   * add location/dateTaken data to emulate moments
   * @param options 
   */
  mockCamerarollAsMoments(options:any={}):Promise<IMoment[]>{
    let index = 0;
    const skip_ids = [47,48,49,50,452,55] // bad ids for picsum
    const moments:IMoment[] = [BANGKOK_LOCATIONS, SIEMREAP_LOCATIONS]
    .map( o=>JSON.parse(o))
    .map( locs=>{
      return locs.map( loc=>{

        do {index++} while (skip_ids.includes(index))

        const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo',{loc});
        const p = MockDataService.inflatePhoto(emptyPhoto, index, index+10);
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
      const locations:string[] = [];
      const dates = photos.map(o=>o.dateTaken).sort();
      const startDate = new Date(dates[0]);
      const endDate = new Date(dates.pop());
      const itemIds = photos.map(o=>o.uuid);
      return { id, title, locations, startDate, endDate, itemIds, photos, bounds,}
    });

    // manually patch locations
    moments[0].locations = ["Bangkok", "Thailand"];
    moments[1].locations = ["Siem Reap", "Cambodia"];

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