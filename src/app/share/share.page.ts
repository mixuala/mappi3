import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef, ViewEncapsulation,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, switchMap, skipWhile } from 'rxjs/operators';
import { AlertController, ActionSheetController } from '@ionic/angular';
import { Plugins } from '@capacitor/core';

import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';
import  { MockDataService, RestyTrnHelper, quickUuid,
  IMarkerGroup, IPhoto, IMarker, IRestMarker, IMarkerList,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';


const { Browser, Device } = Plugins;

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
  public parent: IMarkerList;

  // Observable for MarkerGroupComponent
  public mgCollection$ : Observable<IMarkerGroup[]>;
  // Observable for GoogleMapsComponent
  public markerCollection$ : Observable<IMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public qrcodeData: string = null;
  public toggle:any = {};

  private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string}

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


  public gmap:any;
  setMap(o:{map:google.maps.Map,key:string}){
    this.gmap=o;
    // console.log("google.maps.Map", this.gmap.map)
  }

  getStaticMap(){
    const {map, key} = this.gmap;
    const markers = RestyTrnHelper.getCachedMarkers(this._mgSub.value(), 'visible');
    this.qrcodeData = GoogleMapsComponent.getStaticMap(map, key, markers );
    return
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
    const mListSub = MockDataService.getSubjByUuid(mListId) || 
    MockDataService.getSubjByUuid(mListId, new SubjectiveService(this.dataService.MarkerLists));
    const mgSubj = MockDataService.getSubjByParentUuid(mListId) || 
    MockDataService.getSubjByParentUuid(mListId, new SubjectiveService(this.dataService.MarkerGroups));
    this._mgSub = mgSubj as SubjectiveService<IMarkerGroup>;
    this.markerCollection$ = this.mgCollection$ = this._mgSub.watch$(); 
    // this.mgCollection$.subscribe( mgs=>{
    //   console.log("mgCollection$", mgs)
    // });
    
    await this.dataService.ready();
    mListSub.get$([mListId])
    .pipe(
      takeUntil(this.unsubscribe$),
      skipWhile( v=>v.length==0),
      switchMap( (mLists:IMarkerList[])=>{
        this.parent = mLists[0];
        if (!this.parent) return Promise.resolve([]);
        return mgSubj.get$( this.parent.markerGroupIds )
      })
    )
    .subscribe( res=>{
      // console.log("SharePage.ngOnInit()",res)
    })

    // window['check'] = MockDataService.subjectCache;

  }

  viewWillLeave(){
    console.log("viewWillLeave: SharePage")
  }

  ngOnDestroy() {
    console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }


  /**
   * 
   * @param ev photoswipe gallery
   */
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
  async childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    const marker = change.data;
    switch(change.action){
      case 'selected':
        return this.selectedMarkerGroup = change.data.uuid;
      case 'favorite':
        // DEV: commit immediately
        const done = await this._mgSub.resty.put(marker.uuid, marker as IMarkerGroup);
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
