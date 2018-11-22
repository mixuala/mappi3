import { 
  Component, ElementRef, OnInit, ViewChild,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Content, List, ModalController } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject, } from 'rxjs';
import { takeUntil, map, switchMap, skipWhile } from 'rxjs/operators';

import {
  IMarker, IMarkerList, IMarkerGroup, IPhoto, IMapActions, IMappiMarker,
  IFavorite,
  IRestMarker,
} from '../providers/types';
import  { MockDataService, RestyTrnHelper, quickUuid, } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { AppConfig } from '../providers/helpers';
import { PhotoswipeComponent } from '../photoswipe/photoswipe.component';
import { HelpComponent } from '../providers/help/help.component';
import { AppCache } from '../providers/appcache';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.page.html',
  styleUrls: ['./favorites.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesPage implements OnInit {

  public layout: string;  // values ['edit', 'gallery']
  public mapSettings: IMapActions = {
    dragend: false,
    click: true,
  }
  public mSubj: BehaviorSubject<IMarker[]>;
  public mCollection$ : Observable<IMarker[]>;
  public markerCollection$ : Observable<IMappiMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {
    map: null,
  };

  private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string, mgUuids?:string[]};

  @ViewChild('markerList') slidingList: List;
  @ViewChild(Content) content: Content;
  @ViewChild('contentWrap') contentWrap: ElementRef;

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
        const subject = MockDataService.getSubjByParentUuid(value.uuid);
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
        this.markerCollection$ = this.mCollection$;
        break;
    }
  }
    

  constructor(
    public dataService: MockDataService,
    private router: Router,
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef,
  ) { }





  static getOrCreateFavorite(marker:IMarker):IFavorite{
    const cached = AppCache.for('Favorite').get(marker.uuid);
    if (cached) return cached as IFavorite;

    const fields = ['uuid', 'className', 'favorite', 'created', 'modified'];
    const now = new Date();
    const o = {
      'uuid': marker.uuid,
      'className': marker['className'],
      'favorite': marker['_favorite'],
      'created': now,
      'modified': now,
    }
    return o as IFavorite;
  }

  async inflateFavorites(favorites: IFavorite[]):Promise<IMarker[]> {
    const fetch = favorites.reduce( (res,o)=>{
      res[o.className] = res[o.className] || [];
      res[o.className].push(o.uuid);
      return res;
    },{});

    const byUuid = {}
    const restyLookup = {
      MarkerGroup: 'MarkerGroups',
      MarkerList: 'MarkerLists',
    }

    const waitFor = [];
    Object.keys(fetch).forEach( async (className)=>{
      waitFor.push( this.dataService[restyLookup[className]].get( fetch[className] )
        .then( items=> items.forEach( o=>{
          byUuid[o.uuid]=o;
        }))
      );
    });
    await Promise.all(waitFor)
    // restore sort order of favorites
    const result:IMarker[] = favorites.map( o=>{ 
      const item = byUuid[o.uuid];
      item['_favorite'] = o.favorite;
      return item;
    });
    return Promise.resolve(result);
  }

  async loadFavoritesFromAppCache(){
    const favorites = AppCache.for('Favorite').items() as IFavorite[];
    return await this.inflateFavorites( favorites );
  }

  async ngOnInit() {
    const dontWait = HelpComponent.presentModal(this.modalCtrl, {template:'favorites'});

    this.layout = 'gallery';
    const items = await this.loadFavoritesFromAppCache();
    this.mSubj = new BehaviorSubject<IMarker[]>(items);
    this.markerCollection$ = this.mCollection$ = this.mSubj.asObservable()
    .pipe(
      takeUntil(this.unsubscribe$),
      skipWhile( ()=>!this.stash.activeView),
    )
  }

  async viewWillEnter(){
    try {
      this.stash.activeView = true;
      console.warn(`viewWillEnter: FavoritesPage`)
      this.reload();
      this.cd.detectChanges();
    } catch {}
  }

  viewWillLeave(){
    try {
      this.stash.activeView = false;
      AppCache.storeByClassName('Favorite');
      console.warn(`viewWillLeave: FavoritesPage`);
    } catch {}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }


  toggleSelectMode(action?:string) {
    if (this.layout != "select") {
      this.stash.layout = this.layout;
      this.layout = "select";
      // reset values
      const selected = this.mSubj.value.filter(o=>o['_selected']=false);
    }
    else {
      this.applyChanges(action)
      .then( 
        (mL:IMarkerList)=>{
          this.layout = this.stash.layout;
          this.mgFocus = null;
          const selected = this.mSubj.value.filter(o=>o['_selected']=false);
          if (mL && mL['className']=="MarkerList"){
            // AppCache.for('Key').set(mL, mL.uuid);  // already committed
            this.router.navigate(['map', mL.uuid]);
          }
        },
        err=>console.log('ERROR saving changes',err)
      )
    }
  }

  async scrollToElement(uuid:string){
    try {
      if (this.gallery) return; // skip if photoswipe gallery open

      
      const i = this.mSubj.value.findIndex(o=>o.uuid==uuid);
      const targets = this.contentWrap.nativeElement.querySelectorAll('APP-MARKER-GROUP');
      const target = targets[i];
      this.content.scrollToPoint(0, target.parentNode['offsetTop'], 500);
    } catch (err) {
      console.warn("ERROR", err);
    }
  }

  // called by GoogleMapComponents, marker click
  handle_MapMarkerSelected(uuid:string){
    this.selectedMarkerGroup = uuid;
    this.scrollToElement(uuid);
  }

  async reload(){
    const items = await this.loadFavoritesFromAppCache();
    this.mSubj.next( items );
  }

  /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  async childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    const marker = change.data;
    switch(change.action){
      case 'reload':
        this.mSubj.next( this.mSubj.value );   // called by action="rollback" from child
        return;
      case 'selected':
        // invoked by selected from MarkerGroupComponent
        break;
      case 'favorite':
        // save favorite to cache but do NOT commit immediately
        const item = FavoritesPage.getOrCreateFavorite(marker);
        item.favorite = !item.favorite;
        const changed = AppCache.for('Favorite').set( item );
        break;
    }
  }



  /**
   * commit selected Markers and build a new Trip
   * called by toggleSelectMode(), commit/rollback
   * @param action 
   */
  async applyChanges(action:string):Promise<IMarkerList>{
    // TODO: when do we commit changes to favorite?
    const favorites_noMore = this.mSubj.value.filter(o=>o['_favorite']==false);
    if (favorites_noMore.length) {
      console.warn("TODO: when do we commit changes to IFavorite.favorite???");
      favorites_noMore.forEach( o=>{
        const fav = AppCache.for('Favorite').get(o.uuid) as IFavorite;
        fav.favorite = o['_favorite'];
        AppCache.for('Favorite').set(fav);
        // saved un-favorites will still be shown in FavoritesPage
        // when to purge?
      })
    }
    switch (action) {
      case "commit":
        const mListSub = this.dataService.sjMarkerLists;
        const selected = this.mSubj.value.filter(o=>!!o['_selected']);
        const mList = await FavoritesPage.createMarkerList_from_favorites(selected, mListSub);

        const commitFrom = [mList];
        const committed = await RestyTrnHelper.commitFromRoot(this.dataService, commitFrom);
        this.reload();

        // TODO: refactor MarkerListComponent.cacheDescendents()  
        let subject:SubjectiveService<IMarker>;
        if (mList.hasOwnProperty('markerGroupIds')) {
          subject = new SubjectiveService(this.dataService.MarkerGroups);
          subject.get$(mList.markerGroupIds);
          MockDataService.getSubjByParentUuid(mList.uuid, subject);
        }
        return Promise.resolve(mList);
      case "rollback":
        this.reload();
        // this.mSubj.value.filter(o=>o['_selected']=false);
        return;
    }  
  }




  /**
   * copied from CamerarollPage.createMarkerList_from_Cameraroll()
   * 
   * @param selected 
   * @param mListSub 
   */
  public static createMarkerList_from_favorites(selected:IMarker[], mListSub: SubjectiveService<IMarkerList>):Promise<IMarkerList>{
    if (!selected || selected.length==0) 
      return Promise.resolve(null);

    const count = mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Trip created ${item.created.toISOString()}`;
    item.seq = count;

    // create MarkerGroup < IMarkerList
    let mList_position;
    selected.forEach( async (mg,i)=>{
      item.markerGroupIds.push(mg.uuid);
      if (MappiMarker.hasLoc(mg)) {
        mList_position = mList_position || mg.position;
      }
      else { 
        // get default position for MarkerList
        let latlng = AppConfig.map && AppConfig.map.getCenter();
        if (!latlng) 
          latlng = await GoogleMapsHostComponent.getCurrentPosition();
        const position = latlng.toJSON();
        mList_position = mList_position || position;
      }
    });

    // set position of MarkerList
    RestyTrnHelper.setLocToDefault(item, mList_position);

    // finish up
    RestyTrnHelper.childComponentsChange({data:item, action:'add'}, mListSub);
    return Promise.resolve(item);
  }





  /**
   * 
   * @param ev photoswipe gallery
   */
  async openGallery( mg:IMarkerGroup, mi:IPhoto ) {
    const markerGroups = this.mSubj.value;
    const gallery = await PhotoswipeComponent.prepareGallery(markerGroups, mi, "favorites");

    // // set mgFocus to show markers on Photos
    // const selectedMg = gallery.mgUuids[gallery.index];
    // this.mgFocus = markerGroups.find(o=>o.uuid==selectedMg);
    // // how do you listen for gallery 'destroy` to set this.mgFocus = null;


    this.gallery = gallery;
    // this.cd.detectChanges();
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
        const marker = this.mSubj.value.find(o=>o.uuid==mgUuid) as IMarkerGroup;
        switch (marker.className) {
          case "MarkerGroup": 
            this.mgFocus = (marker.markerItemIds.length > 1) ? marker : null;
            break;
          case "MarkerList":
            this.mgFocus = (marker.markerGroupIds.length > 1) ? marker : null;
            break;
        }
        if (this.mgFocus == null) {
          // go back to mapping MarkerGroups, highlight correct marker
          this.selectedMarkerGroup = marker.uuid;
        }
      }
    }
  }

}
