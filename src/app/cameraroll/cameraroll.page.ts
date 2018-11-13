import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject, ReplaySubject } from 'rxjs';


import { 
  IPhoto, 
  IMoment, IExifPhoto, IMappiLibraryItem, IMappiGetLibraryOptions, IMappiGetThumbnailOptions, IChoosePhotoOptions,
} from '../providers/types'
import { PhotoService, PhotoLibraryHelper, } from '../providers/photo/photo.service';
import { ImgSrc, } from '../providers/photo/imgsrc.service';
import  { MockDataService, RestyTrnHelper } from '../providers/mock-data.service';
import { AppCache } from '../providers/appcache';
import { ModalController } from '@ionic/angular';

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
  static async navPush(options?:any){
    const nav = document.querySelector('ion-nav');
    await nav.componentOnReady();
    nav.classList.add('activated');
    options = Object.assign( {isNav:true}, options );
    return nav.push(CamerarollPage, options);
  }

  /**
   * launch as Modal
   * @param modalCtrl 
   * @param options 
   */
  static async presentModal(modalCtrl:ModalController, options?:any){
    options = Object.assign( {isModal:true}, options );
    modalCtrl.create({
        component: CamerarollPage,
        componentProps: options,
    }).then((modal) => {
        modal.present();
    });
  }

  // detect launch mode to set appropriate dismiss()
  isModal:boolean = false;
  isNav:boolean = false;
  layout:string = "cameraroll"; // enum=[gallery, list, edit, focus-marker-group]
  stash:any = {};

  public miSubject: ReplaySubject<IPhoto[]> = new ReplaySubject<IPhoto[]>(1);
  public miCollection$: Observable<IPhoto[]> = this.miSubject.asObservable();

  @Input() items:IPhoto[] | IMappiLibraryItem[];

  constructor(
    private route: ActivatedRoute,
    public photoService: PhotoService,
  ) { }

  async ngOnInit() {
    const options = {};
    let photos = await this.photoService.getCamerarollAsPhotos(options);
    if (photos.length==0) {
      // load mock cameraroll, direct assignment, does not use ngOnChanges();
      // photos = await this.mockCameraroll(options);
      const items = AppCache.for('Photo').items();
      const dim = "x160";  // height==160
      items.forEach( mi=>{
        if (!mi._imgSrc$){
          mi.imgSrc$ = ImgSrc.getImgSrc$(mi, dim);
        }
      })
      this.miSubject.next(items);
    }
  }

  async close() {
    if (this.isModal || this["modal"] ) this["modal"].dismiss();
    if (this.isNav) {
      const nav = document.querySelector('ion-nav');
      nav.classList.remove('activated');
    }
  }

  /**
   * NOTE: Page behavior does not get data through @Input
   */
  ngOnChanges(){

  }

  thumbClicked(item:IPhoto|IMappiLibraryItem){
    console.log("Cameraroll selected, item=", item);
  }


  /**
   * add location/dateTaken data to emulate moments
   * @param options 
   */
  mockCameraroll(options:any={}):Promise<IPhoto[]>{
    const CAMERAROLL_COUNT = 20;
    const photos = Array.from(Array(CAMERAROLL_COUNT).keys()).map( i=>{
      const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo');
      const p = MockDataService.inflatePhoto(emptyPhoto, i, i);
      // add loc and dateTaken
      return p;
    })

    // filter bounds/dateTaken
    if (options.from || options.to) {
      // filter by dateTaken
    }
    if (options.bounds) {
      // filter by bounds
    }

    // convert to IPhoto for display
    return Promise.resolve(photos);
  }

}
