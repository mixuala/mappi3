import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { List } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, switchMap, filter, skipWhile, first } from 'rxjs/operators';

import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, MappiService, } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';
import  { MockDataService, RestyTrnHelper, quickUuid,
  IMarkerGroup, IPhoto, IMarker, IRestMarker, IMarkerList,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService } from '../providers/photo/photo.service';
import { GoogleMapsComponent , IMapActions } from '../google-maps/google-maps.component';
import { ImgSrc, IImgSrc } from '../providers/photo/imgsrc.service';
import { ScreenDim } from '../providers/helpers';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit, IViewNavEvents {

  // layout of markerList > markerGroups > markerItems: [edit, default]
  public layout: string;
  public mapSettings: IMapActions = {
    dragend: false,
    click: false,
    clickadd: false,
  }
  public parent: IMarkerList;

  // Observable for MarkerGroupComponent
  public mgCollection$ : Observable<IMarkerGroup[]>;
  // Observable for ScreenDim, used by photoswipe to resize on rotate.
  public screenDim$ = ScreenDim.dim$;
  // Observable for GoogleMapsComponent
  public markerCollection$ : Observable<IMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {};

  private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string}

  @ViewChild('markerGroupList') slidingList: List;
  @ViewChild('gmap') map: GoogleMapsComponent;

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
        this.mapSettings = {
            dragend: true,
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

  constructor( 
    public dataService: MockDataService,
    public photoService: PhotoService,
    private router: Router,
    private route: ActivatedRoute,
    private cd: ChangeDetectorRef,
  ){
    this.dataService.ready()
    .then( ()=>{
      // this._mgSub = this.dataService.sjMarkerGroups;
      // set in ngOnInit()
    })
  }

  nav(page:string, item:IMarkerList){
    console.warn('check for commit/rollback before leaving view')
    this.router.navigate([page, item.uuid]);
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
    this.map.activeView = true;
    console.warn("GoogleMapComponent for HomePage is active map=", this.map.map['id']);
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
      
    // initialize subjects
    await this.dataService.ready();
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
    
    // detectChanges if in `edit` mode
    const layout = this.route.snapshot.queryParams.layout;
    if ( layout=='edit' ) {
      setTimeout( ()=>{
        this.toggleEditMode('edit');
        this.cd.detectChanges();
      },100);
    };
    this.stash.activeView = true;
    this.markerCollection$.subscribe( o=>console.log( "map markers", o));
    console.warn("HomePage ngOnInit complete");
  }

  viewWillEnter(){
    try {
      // this.mapSettings = Object.assign({}, this.mapSettings);
      this._mgSub.repeat();
      this.stash.activeView = true;
      if (!this.map) return;
      this.map.activeView = true;
      console.warn("viewWillEnter: HOMEPage, map=", this.map.map['id']);
    } catch (err) {console.warn(err)}
  }

  viewWillLeave(){
    try {
      this.stash.activeView = false;
      if (!this.map) return;
      this.map.activeView = false;
      console.warn(`viewWillLeave: HOMEPage, map=${this.map.map['id']}`)
    } catch (err) {console.error(err)}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }


  toggleEditMode(action?:string) {
    if (this.layout != "edit" || action=='edit') {
      this.stash.layout = this.layout;
      this.layout = "edit";
      this.mapSettings = {
        dragend: true,
        click: true,
        clickadd: true,
      }
      console.log("home.page.ts: layout=", this.layout)
    }
    else {
      return this.applyChanges(action)
      .then( (changed:IMarker[])=>{
          this.layout = this.stash.layout;
          this.mapSettings = {
            dragend: false,
            click: false,
            clickadd: false,
          }
          console.log("home.page.ts: layout=", this.layout)
        },
        err=>console.log('ERROR saving changes', err)
      )
    }    
  }

  /**
   * create a new MarkerGroup from:
   *     1) a map click/location or 
   *     2) from the create button,
   *  specifying either a selected image or mapCenter as the marker location
   * @param data IMarker properties, specifically [loc | seq]
   * @param ev click event
   * 
   */
  async createMarkerGroup(ev:any={}, data:any={}):Promise<IMarkerGroup>{
    const target = ev.target && ev.target.tagName;
    const mgSubj = MockDataService.getSubjByParentUuid(this.parent.uuid);

    let mgParent:IMarkerGroup;

    let child:IPhoto;
    if (target=='ION-BUTTON')
      child = await this.photoService.choosePhoto(0);
    else if (data.className == 'Photo')
      // create markerGroup using photo as location
      child = data;

    // BUG: not adding mg/parent, to MarkerList subject. 
    // on applyChanges/commit, add MarkerList.markerGroupIds.push(parent)
    if (child)
      mgParent = RestyTrnHelper.getPlaceholder('MarkerGroup');
    else {
      // create parent from map click with location data
      mgParent = RestyTrnHelper.getPlaceholder('MarkerGroup', data);
    }
    mgParent.label = `Marker created ${mgParent.created.toISOString()}`;
    mgParent.seq = data.seq || this._mgSub.value().length;
    // cache subject by MarkerGroup.uuid
    MockDataService.getSubjByUuid(mgParent.uuid, this._mgSub);

    return Promise.resolve(true)
    .then ( async ()=>{
      if (MappiMarker.hasLoc(child)) {
        const parentSubj = MockDataService.getSubjByUuid(mgParent.uuid);
        RestyTrnHelper.setFKfromChild(mgParent, child);
        RestyTrnHelper.setLocFromChild(mgParent, child);
        console.log("createMarkerGroup, selected Photo", child.loc, child);
      }
      if (MappiMarker.hasLoc(mgParent)) 
        return Promise.resolve(true)
      return Promise.reject('continue');
    })
    .catch( (err)=>{
      if (err=='continue') {
        // no IPhoto returned, get a placeholder
        return Promise.resolve(true)
        .then( ()=>{
          let position = this.map.map && this.map.map.getCenter();
          if (position) 
            return position;
          else
            return GoogleMapsComponent.getCurrentPosition();
        })
        .then( (latlng:google.maps.LatLng)=>{
          const position = latlng.toJSON();
          console.warn("createMarkerGroup, default position", position);
          RestyTrnHelper.setLocToDefault(mgParent, position);
          return mgParent;
        });
      }
      console.warn(`HomePage.createMarkerGroup() `,err);
    })
    .then( ()=>{
      // add markerGroup to subject
      RestyTrnHelper.childComponentsChange({data:mgParent, action:'add'}, this._mgSub);
      this.publishMarkerGroupItems(mgParent);
      return mgParent;
    })    
  }

  publishMarkerGroupItems(mg:IMarkerGroup) {
    if (mg.markerItemIds.length) {
      setTimeout( ()=>{
        // publish Photos
        const childSubj = MockDataService.getSubjByParentUuid(mg.uuid);
        const mItems = (mg as IRestMarker)._commit_child_items || [];
        childSubj.next(mItems); // cannot .reload() until after commit
      },10)
    }
  }


  reorderMarkerGroup(ev){
    // make changes to local copy, not resty/DB
    // localCopy includes o._rest_action='delete' items because from,to index includes the same
    const localCopy = RestyTrnHelper.getCachedMarkers(this._mgSub.value());
    const {from, to} = ev.detail;
    let move = localCopy.splice(from,1);
    localCopy.splice( to, 0, move[0]);

    // re-index after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = localCopy[i];
      o.seq=i;
      this.childComponentsChange({data:o, action:'move'})
    }
    this._mgSub.next(RestyTrnHelper.getCachedMarkers(this._mgSub.value()) as IMarkerGroup[]);
  }

  async mappiMarkerChange(change:{data:IMarker, action:string}){
    const mm = change.data;
    // mm could be either IMarkerGroup or IPhoto
    if (!this.mgFocus) {
      // handle IMarkerGroup
      const items = RestyTrnHelper.getCachedMarkers(this._mgSub.value() );
      switch (change.action) {
        case 'add':   // NOTE: ADD IMarkerGroup by clicking on map in layout=edit
          // create MarkerGroup at IMarker location
          await this.createMarkerGroup(undefined, mm)
          // manually trigger ChangeDetection when click from google.maps
          break;
        case 'update':    // NOTE: can update IMarkerGroup or IPhoto
          this.handle_MarkerGroupMoved(change);
          break;
      }
    } else if (this.mgFocus) {
      this.handle_MarkerItemMoved(change);
    }
    setTimeout(() => this.cd.detectChanges(),10);
  }

  handle_MarkerGroupMoved(change:{data:IMarker, action:string}){
    const mm = change.data;
    const subject = this._mgSub;
    // const items = RestyTrnHelper.getCachedMarkers( subj.value() );
    const items = subject.value();
    if (change.action = 'update') {
      const found = items.findIndex(o => o.uuid == mm.uuid);
      if (~found) {
        const { loc, locOffset } = mm;
        const marker = Object.assign(items[found], { loc, locOffset });
        marker.position = MappiMarker.position(marker);
        marker['modified'] = new Date();
        marker['_detectChanges'] = 1;   // signal MarkerGroupComponent to do ChangeDetection
        // this.childComponentsChange({ data: marker, action: 'update' });
        marker['_rest_action'] = marker['_rest_action'] || 'put';
        subject.next(items);
      }
    }
  }

  handle_MarkerItemMoved(change:{data:IMarker, action:string}){
    const mm = change.data;
    const mg = this.mgFocus;
    const subject = this._getSubjectForMarkerItems( mg );
    const items = subject.value();
    if (change.action = 'update') {
      const found = items.findIndex(o => o.uuid == mm.uuid);
      if (~found) {
        const { loc, locOffset } = mm;
        const marker = Object.assign(items[found], { loc, locOffset });
        marker.position = MappiMarker.position(marker);
        marker['modified'] = new Date();
        marker['_detectChanges'] = 1;   // signal MarkerGroupComponent to do ChangeDetection
        marker['_rest_action'] = marker['_rest_action'] || 'put';
        subject.next(items);
      }        
    }
  }

  /**
   * 
   * @param ev photoswipe gallery
   */
  async openGallery(ev:{mg:IMarkerGroup, mi:IPhoto}) {
    const {mg, mi} = ev;
    const items:PhotoSwipe.Item[] = []; 
    const screenDim = await ScreenDim.dim;
    // get all photos for this markerGroup
    const waitFor:Promise<void>[] = [];
    let found:number;
    const mgPhotos_subject = this._getSubjectForMarkerItems(mg);
    mgPhotos_subject.value().map( (p:IPhoto)=>{

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
            if (p.uuid == mi.uuid) found = items.length-1;
            done && done.unsubscribe();
            resolve();
          });

        })
      );

    });
    await Promise.all(waitFor);
    const index = found || 0;
    const uuid = mg.uuid;
    this.gallery = {items, index, uuid};
    this.cd.detectChanges();
  }


  focusMarker(ev:{index:number, items:any[], uuid:string}){
    this.selectedMarkerGroup = this.gallery.uuid;
  }

  /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    switch(change.action){
      case 'selected':
        return this.selectedMarkerGroup = change.data.uuid;
      case 'remove':
        RestyTrnHelper.childComponentsChange(change, this._mgSub);

        // BUG: ion-item-sliding
        // see: https://github.com/ionic-team/ionic/issues/15486#issuecomment-419924318
        return this.slidingList.closeSlidingItems();
      default:
        return RestyTrnHelper.childComponentsChange(change, this._mgSub);
    }
  }

  /**
   * commit markerList/Group/Item changes
   * called by HomePage.toggleEditMode(), commit/rollback from:
   *    - new MarkerList/Group/Item
   *    - edit MarkerList/MarkerGroup
   * @param action 
   */
  async applyChanges(action: string): Promise<IMarker[]> {
    
    const parent = this.parent as IRestMarker;
    const layout = this.route.snapshot.queryParams.layout;
    const mListSubj = MockDataService.getSubjByUuid(this.parent.uuid);

    // begin commit from MarkerList
    switch (action) {
      case "commit":
      // propagate changes to MarkerList
      let commitSubj:SubjectiveService<IRestMarker>;
      const mgSubjUuids = this._mgSub.value().map(o => o.uuid);
      try {
        const mList_markerGroupIds = this.parent.markerGroupIds;
        if ( 
          // check if MarkerList stale, if markerGroupIds are not equal
          parent._rest_action ||
          mgSubjUuids.length != mList_markerGroupIds.length ||
          mgSubjUuids.filter(v => !mList_markerGroupIds.includes(v)).length > 0
        ) {
          this.parent.markerGroupIds = mgSubjUuids;
          parent._rest_action = parent._rest_action || 'put';

          parent._commit_child_items = this._mgSub.value();
          commitSubj = mListSubj;
        }
        else {
          // markerList not changed, just update markerGroups
          commitSubj = this._mgSub;
        }
        const committed = await RestyTrnHelper.applyChanges(action, commitSubj, this.dataService);
        console.log("HomePage: committed", committed);
        // subject.reload() called in RestyTrnHelper.applyChanges()
        if ( layout=='edit' )  this.router.navigateByUrl('list');
        return Promise.resolve(committed);

      } catch (err) {
        console.warn("Error: cannot save to DEV MarkerGroup, parent is null");
        return Promise.reject(err);
      }
    case "rollback":
      this._mgSub.reload();
      mListSubj.reload();
      if ( layout=='edit' )  this.router.navigateByUrl('list');
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
