import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { List } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, switchMap, filter, skipWhile, first } from 'rxjs/operators';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto, IMapActions, IMarkerLink,
} from '../providers/types';
import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, } from '../providers/mappi/mappi.service';
import  { MockDataService, RestyTrnHelper, quickUuid, } from '../providers/mock-data.service';
import { RestyService } from '../providers/resty.service';
import { SubjectiveService, UnionSubjectiveService } from '../providers/subjective.service';
import { PhotoService } from '../providers/photo/photo.service';
import { CamerarollPage } from '../cameraroll/cameraroll.page';
import { PhotoswipeComponent } from '../photoswipe/photoswipe.component';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { ScreenDim, AppConfig, Humanize } from '../providers/helpers';
import { Hacks} from '../providers/hacks';
import { AppCache } from '../providers/appcache';

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
        this.stash.disableEditMode = true;
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
        this.stash.disableEditMode = false;
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
    // this.dataService.ready()
  }

  nav(page:string, item:IMarkerList){
    this.router.navigate([page, item.uuid]);
  }

  // TODO: deprecate
  private _getSubjectForMarkerItems(mg:IMarkerGroup):SubjectiveService<IMarker>{
    return MockDataService.getSubjByParentUuid(mg.uuid);
  }

  getSubjByParentUuid_Watch$ = (uuid:string)=>{
    const found = MockDataService.getSubjByParentUuid(uuid);
    return found && found.watch$();
  }

  /**
   * uncommitted data is LOST when you call childSubj.reload$() or .get$()
   * - use childSubj.watch$()
   * @param mL 
   */
  inflateUncommittedMarker(mL:IMarkerList):boolean{
    // recurse through tree, add IMarkers which have not been committed to DB
    if (!mL || mL['_rest_action'] != 'post') return false;

    const mgs = mL['_commit_child_items'] || [];
    const childSubj = MockDataService.getSubjByParentUuid(mL.uuid) || 
          MockDataService.getSubjByParentUuid(mL.uuid, new SubjectiveService(this.dataService.MarkerGroups));
    childSubj.next(mgs);
    return true;
  }

  async ngOnInit() {

    this.layout = "default";
    const mListId = this.route.snapshot.paramMap.get('uuid');

    // configure subjects and cache
    const uncommitedMarker = AppCache.for('Key').get(mListId);
    if (uncommitedMarker && uncommitedMarker['_rest_action']){
      AppCache.for('Key').remove(mListId);
      this.inflateUncommittedMarker(uncommitedMarker);
      this.parent = uncommitedMarker;
    }

    await this.dataService.ready();
    // await AppConfig.mapReady

    // configure subjects and cache
    let mgSubj = MockDataService.getSubjByParentUuid(mListId);
    if (!mgSubj) {
      const restys:RestyService<IMarker>[] = [this.dataService.MarkerGroups, this.dataService.MarkerLinks ];
      const subject = new UnionSubjectiveService(restys);
      mgSubj = MockDataService.getSubjByParentUuid(mListId, subject);
    }
    this._mgSub = mgSubj as SubjectiveService<IMarkerGroup>;
    
    
    // for async binding in view
    this.markerCollection$ = this.mgCollection$ = this._mgSub.watch$()
    .pipe( 
      takeUntil(this.unsubscribe$),
      skipWhile( ()=>!this.stash.activeView),
      );
      

    // initialize subjects
    if (!this.parent){    // get from Resty
      this.dataService.MarkerLists.get([mListId])
      .then( arr=>{
        this.parent = arr.length ? arr[0] : null;
        if (this.parent && mgSubj.isStale(this.parent.markerGroupIds))
          mgSubj.get$(this.parent.markerGroupIds);
      
        this.cd.markForCheck();  // required because async pipe initialized AFTER await
      });
    }


    // detectChanges if in `edit` mode
    const layout = this.route.snapshot.queryParams.layout;
    if ( layout=='edit' ) {
      setTimeout( ()=>{
        this.toggleEditMode('edit');
        this.cd.detectChanges();
      },100);
    };
    console.warn("HomePage ngOnInit complete");
  }

  viewWillEnter(){
    try {
      // this.mapSettings = Object.assign({}, this.mapSettings);
      this.stash.activeView = true;
      this._mgSub.repeat();
      console.warn(`viewWillEnter: HOMEPage`);
    } catch (err) {console.warn(err)}
  }

  viewWillLeave(){
    try {
      this.stash.activeView = false;
      console.warn(`viewWillLeave: HOMEPage`)
    } catch (err) {console.error(err)}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }


  toggleEditMode(action?:string) {
    if (this.layout != "edit" || action=='edit') {
      if (this.stash.disableEditMode) return;
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
   * create a new MarkerGroup from CamerarollPage Modal
   *   ios) uses cameraroll via PhotoService.scan_moments_PhotoLibrary_Cordova()
   *   web) uses PhotoService.mockCamerarollAsMoments(options);
   * 
   * @param selected IPhoto[], expecting IPhoto._moment: IMoment
   */
  async createMarkerGroup_fromCameraroll(selected:IPhoto[]){
    // TODO: refactor, add parent.uuid to params
    // TODO: refactor add MarkerGroupComponent.createMarkerGroup():IMarkerGroup
    return CamerarollPage.createMarkerGroup_from_Cameraroll(selected, this._mgSub)
    .then( mg=>{ 
      AppCache.for('Key').set(mg, mg.uuid);
    })
  }


  /**
   * called by 
   *    1) HomePage.mappiMarkerChange(mm:IMappiMarker)
   *    2) app-marker-add[(markerChange)="createMarkerGroup_fromMarker($event)"]
   * 
   * NOTE: markerItemIds==[]
   * @param marker 
   */
  createMarkerGroup_fromMarker(change:{data:IMarker, action:string} ):IMarkerGroup{
    const marker = change.data;
    let mg:IMarkerGroup;
    switch(marker.className) {
      case 'MarkerLink':
        mg = Hacks.patch_MarkerLink_as_MarkerGroup(marker as any as IMarkerLink);
        break;
      case 'MarkerGroup': 
        break;
      case 'MappiMarker': // from map click
        marker['label'] = `Dropped Marker`;
        const position = MappiMarker.position(marker);
        marker['description'] = `created at ${Humanize.position(position)}`;
        // TODO: reverse geo-code for address?
      case 'PlaceResultMarker':
      case 'GeocodeResultMarker':
      default:
        delete marker.className;
        mg = RestyTrnHelper.getPlaceholder('MarkerGroup', marker);
        // this.mgCollection$.subscribe( items=>console.log("XXX> MG observer count=", items.length))
        break;
    }
    // console.log("0> about to create MarkerGroup=",mg);
    switch(change.action) {
      case 'add': 
        // add to Parent.FK, add _rest_action='post'
        this.childComponentsChange({data:mg, action:'add'}); 
        this.publishMarkerGroupItems(mg);
        console.log("2> done ",mg);
        return mg;    
    }
  }

  /**
   * called by ev:MouseEvent
   * uses PhotoService.choosePhoto(, provider)
   * @param ev click event 
   * @param provider [Bounds, Moments, RandomCameraRoll, Camera]
   */
  async createMarkerGroup_fromPhotoLibrary(ev:any={}, provider?:string){
    const target = ev.target && ev.target.tagName;
    const mgSubj = MockDataService.getSubjByParentUuid(this.parent.uuid);
    let child:IPhoto;
    if (target=='ION-BUTTON' || provider){
      const mgs = mgSubj.value() as IMarkerGroup[];
      if (mgs.length==0 || provider) {
        // markerList._rest_action='post', add first MarkerGroup
        child = await this.photoService.choosePhoto(0, {provider});
        console.log( "### 0) HomePage.choosePhoto, photo=",child, AppCache.for('Cameraroll').get(child.camerarollId))
      } else {
        // once a markerGroup is available, filter by map bounds
        const positions = mgs.map(o=>o.position);
        const bounds = AppConfig.map.getBounds();
        const except = mgs.reduce((res,o)=>{
          return res.concat(o.markerItemIds || [])
        },[])
        .map(uuid=>{
          const found = AppCache.for('Photo').get(uuid);
          return found && found.camerarollId;
        }).filter( v=>!!v);
        /**
         * choose one from photos near position of first markerGroup. 
         * or bounds of current map
         *  */ 
        child = await this.photoService.choosePhoto(0, {positions, bounds, except});
        console.log( "### 1+) HomePage.choosePhoto, photo=",child, AppCache.for('Cameraroll').get(child.camerarollId))
      }
    } else if (AppConfig.device.platform=='ios'){
      // DEMO only, use cordova.plugin.camera
      child = await this.photoService.choosePhoto(0, {provider:"Camera"});
      console.log( "### 0) HomePage.choosePhoto, photo=",child, AppCache.for('Cameraroll').get(child.camerarollId))
    }
    this.createMarkerGroupFromChild(child);
  }

  /**
   // TODO: make static method of MarkerGroupComponent.createMarkerGroupFromChild()
   * create MarkerGroup from MarkerItem (IPhoto, IMarkerLink)
   *  - set loc from MarkerItem, if available
   *  - fallback map.getCenter()
   * 
   * NOTE: additional MarkerItems added using MarkerGroupComponent.childComponentsChange({data:photo, action:'add'});
   * @param child should be result of RestyTrnHelper.getPlaceholder('Photo', data)
   */
  async createMarkerGroupFromChild(child:IPhoto):Promise<IMarkerGroup>{

    let mgParent:IMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    mgParent.label = `Marker created ${mgParent.created.toISOString()}`;

    return Promise.resolve(true)
    .then ( async ()=>{
      if (MappiMarker.hasLoc(child)) {
        RestyTrnHelper.setFKfromChild(mgParent, child);
        RestyTrnHelper.setLocFromChild(mgParent, child);
        console.log(`createMarkerGroup: selected Photo`, JSON.stringify(child).slice(0,100));
      }
      if (MappiMarker.hasLoc(mgParent)) 
        return Promise.resolve(true)
      return Promise.reject('continue');
    })
    .catch( (err)=>{
      if (err=='continue') {
        // no IPhoto returned, get a placeholder
        return Promise.resolve(true)
        .then( async ()=>{
          // get default position for MarkerList
          let latlng = AppConfig.map && AppConfig.map.getCenter();
          if (!latlng) 
            latlng = await GoogleMapsHostComponent.getCurrentPosition();
          const position = latlng.toJSON();
          RestyTrnHelper.setLocToDefault(mgParent, position);
          return mgParent;
        });
      }
      console.warn(`HomePage.createMarkerGroup() `,err);
    })
    .then( ()=>{
      // add markerGroup to subject
      this.childComponentsChange({data:mgParent, action:'add'});

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
    const copy = RestyTrnHelper.getCachedMarkers(this._mgSub.value());
    const {from, to} = ev.detail;
    let move = copy.splice(from,1);
    copy.splice( to, 0, move[0]);

    // re-index after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = copy[i];
      o.seq=i;
      this.childComponentsChange({data:o as IMarkerGroup, action:'move'})
    }

    // update MarkerList FKs
    this.parent.markerGroupIds = RestyTrnHelper.getCachedMarkers(copy, 'visible').map(o=>o.uuid);
    // this.mListChange.emit( {data:this.parent, action:'update'});
    const mList = this.parent as IRestMarker;
    mList._rest_action = mList._rest_action || 'put';

    // push changes
    this._mgSub.next(RestyTrnHelper.getCachedMarkers(this._mgSub.value()) as IMarkerGroup[]);

    // see: https://github.com/ionic-team/ionic/tree/master/core/src/components/reorder-group
    ev.detail.complete && ev.detail.complete();
  }

  async mappiMarkerChange(change:{data:IMarker, action:string}){
    // mm could be either IMarkerGroup or IPhoto
    if (!this.mgFocus) {
      switch (change.action) {
        case 'add':   // NOTE: ADD IMarkerGroup by clicking on map in layout=edit
          // create MarkerGroup at IMarker location
          await this.createMarkerGroup_fromMarker(change)
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
    const gallery = await PhotoswipeComponent.prepareGallery([mg], mi, mg.uuid);
    this.gallery = gallery;

    // update selectedMarkerGroup
    this.selectedMarkerGroup = mg.uuid;
    this.cd.detectChanges();
    return
  }

  // called by photoswipe on item changed
  handle_GalleryIndexChange(ev:{index:number, items:any[], uuid:string}){
    this.selectedMarkerGroup = this.gallery.uuid;
  }

  /*
   * additional event handlers, 
   */

  /**
   * reload after commit/rollback
   */
  async reload(changed:IMarker[]=[]){
    const waitFor = [];
    // reload tree
    // TODO: get original markerIds;
    const mgSubjUuids = this._mgSub.value().map(o => o.uuid);
    mgSubjUuids && mgSubjUuids.forEach( uuid=>{
      const mItemSubj = MockDataService.getSubjByParentUuid(uuid);
      if (mItemSubj) waitFor.push( mItemSubj.reload() );
    })

    // TODO: not reloading markerLists
    waitFor.push( this._mgSub.reload( mgSubjUuids ) );

    const found = changed.find(o=>o.uuid==this.parent.uuid);
    if (found) 
      this.parent = found as IMarkerList;
    else {
      waitFor.push (this.dataService.MarkerLists.get([this.parent.uuid])
        .then( arr=>this.parent=arr.pop())
      );
    }
    const done = await Promise.all(waitFor);
    return
  }


  // handle childComponent/MarkerGroup changes
  childComponentsChange( change: {data:IMarkerGroup, action:string}){
    if (!change.data) return;
    const parent:IMarkerList = this.parent;
    const restMarker = parent as IRestMarker;
    switch(change.action){
      case 'reload':
        this.reload();   // called by action="rollback"
        return;
      case 'selected':
        return this.selectedMarkerGroup = change.data.uuid;
      case 'remove':
        // just HIDE in view, do NOT remove until COMMIT
        parent.markerGroupIds = parent.markerGroupIds.filter(uuid=>uuid!=change.data.uuid);
        restMarker._rest_action = restMarker._rest_action || 'put';
        RestyTrnHelper.childComponentsChange(change, this._mgSub, parent.markerGroupIds);

        // BUG: ion-item-sliding
        // see: https://github.com/ionic-team/ionic/issues/15486#issuecomment-419924318
        return this.slidingList.closeSlidingItems();
      case 'add':
        // update MarkerList FKs (Parent)
        parent.markerGroupIds = parent.markerGroupIds.slice(); // make a copy
        parent.markerGroupIds.push(change.data.uuid);
        restMarker._rest_action = restMarker._rest_action || 'put';
        // continue processing Child IMarkerGroup
        return RestyTrnHelper.childComponentsChange(change, this._mgSub, parent.markerGroupIds);
      default:
        return RestyTrnHelper.childComponentsChange(change, this._mgSub);
    }
  }

  // checked by ConfirmChangesRouteGuard.canDeactivate()
  hasChanges():boolean{
    let found:IRestMarker;
    // check MarkerGroups for changes or new MarkerItems
    const mgs:IRestMarker[] = this._mgSub.value();
    found = mgs.find( mg=>!!mg._rest_action );
    if (found) 
      return true;
    
    // check MarkerList for new MarkerGroups
    const parent = this.parent as IRestMarker; 
    if (parent && parent._rest_action){
      return true;
    }

    // check if MarkerItems have changes
    found = mgs.find( (mg:IRestMarker)=>{
      const miSubj = MockDataService.getSubjByParentUuid(mg.uuid);
      found = miSubj.value().find( (p:IRestMarker)=>{
        return !!p._rest_action;
      });
      return !!found;
    });
    if (found) 
      return true;
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
    if (!parent) return;


    const layout = this.route.snapshot.queryParams.layout;
    const mGroupSubj = this._mgSub;

    // begin commit from MarkerList
    switch (action) {
      case "commit":
      // propagate changes to MarkerList
      const mgSubjUuids = mGroupSubj.value().map(o => o.uuid);
      try {
        if ( parent._rest_action ) {
          this.parent.markerGroupIds = mgSubjUuids;
          parent._rest_action = parent._rest_action || 'put';
          parent._commit_child_items = this._mgSub.value(); // TODO: filter by ._rest_action
        }

        const commitFrom = (this.parent as IRestMarker)._rest_action ? [this.parent] : this._mgSub.value();
        const committed = await RestyTrnHelper.commitFromRoot( this.dataService, commitFrom);
        await this.reload(committed);
        console.warn("HomePage: COMMIT complete", committed);  

        if ( layout=='edit' ){
          const data = {'map-center': this.parent.loc.join(',')};
          // this.router.navigate(['/list'], {queryParams:data} );  // queryParams not working
          this.router.navigate(['/list', data ]);
        }
        return Promise.resolve(committed);
      } catch (err) {
        console.warn("Error: cannot save to DEV MarkerGroup, parent is null", err);
        return Promise.reject(err);
      }
    case "rollback":
      // reload tree
      await this.reload();
      if ( layout=='edit' ){
        this.router.navigateByUrl('list');
      }
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
