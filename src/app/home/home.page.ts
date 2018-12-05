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
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService } from '../providers/photo/photo.service';
import { CamerarollPage } from '../cameraroll/cameraroll.page';
import { PhotoswipeComponent } from '../photoswipe/photoswipe.component';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { ScreenDim, AppConfig, Hacks } from '../providers/helpers';
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
    const mgSubj = MockDataService.getSubjByParentUuid(mListId) || 
      MockDataService.getSubjByParentUuid(mListId, new SubjectiveService(this.dataService.MarkerGroups));
    this._mgSub = mgSubj as SubjectiveService<IMarkerGroup>;

    // for async binding in view
    this.markerCollection$ = this.mgCollection$ = this._mgSub.watch$()
        .pipe( skipWhile( ()=>!this.stash.activeView) );
      
    // initialize subjects
    await Promise.all([this.dataService.ready(), AppConfig.mapReady]);

    if (!this.parent){    // get from Resty
      this.parent = await this.dataService.MarkerLists.get([mListId]).then( arr=>arr.length ? arr[0] : null);
    }
    if (this.parent && mgSubj.value().length==0) 
      mgSubj.get$(this.parent.markerGroupIds);
    
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
   * @param selected IPhoto[], expecting IPhoto._moment: IMoment
   */
  async createMarkerGroup_fromCameraroll(selected:IPhoto[]){
    // TODO: refactor, add parent.uuid to params
    return CamerarollPage.createMarkerGroup_from_Cameraroll(selected, this._mgSub)
    .then( mg=>{ 
      AppCache.for('Key').set(mg, mg.uuid);
    })
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
  async createMarkerGroup(ev:any={}, data:any={}, provider?:string):Promise<IMarkerGroup>{
    const target = ev.target && ev.target.tagName;
    const mgSubj = MockDataService.getSubjByParentUuid(this.parent.uuid);
    data = data || {};

    let mgParent:IMarkerGroup;
    let child:IPhoto;
    if (target=='ION-BUTTON' || provider){
      const mgs = mgSubj.value() as IMarkerGroup[];
      if (mgs.length==0 || provider) {
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
      // DEMO only
      child = await this.photoService.choosePhoto(0, {provider:"Camera"});
      console.log( "### 0) HomePage.choosePhoto, photo=",child, AppCache.for('Cameraroll').get(child.camerarollId))

    } else if (data.className == 'Photo'){
      // create markerGroup using photo as location
      child = data;
    }
    
    if (child){
      mgParent = RestyTrnHelper.getPlaceholder('MarkerGroup');
    } 
    else {
      // create parent from map click with location data
      mgParent = RestyTrnHelper.getPlaceholder('MarkerGroup', data);
    }
    mgParent.label = `Marker created ${mgParent.created.toISOString()}`;
    mgParent.seq = data.seq || this._mgSub.value().length;

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
        .then( ()=>{
          let position = AppConfig.map.getCenter();
          if (position) 
            return position;
          else
            return GoogleMapsHostComponent.getCurrentPosition();
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
    const mgSubjUuids = this._mgSub.value().map(o => o.uuid);
    mgSubjUuids && mgSubjUuids.forEach( uuid=>{
      const mItemSubj = MockDataService.getSubjByParentUuid(uuid);
      if (mItemSubj) waitFor.push(mItemSubj.reload(undefined, true));
    })
    waitFor.push(this._mgSub.reload());

    const found = changed.find(o=>o.uuid==this.parent.uuid);
    if (found) 
      this.parent = found as IMarkerList;
    else {
      waitFor.push (this.dataService.MarkerLists.get([this.parent.uuid])
        .then( arr=>this.parent=arr.pop())
      );
    }
    await waitFor;
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
      case 'markerLink':
        // add markerLink to current marker
        const mg = Hacks.patch_MarkerLink_as_MarkerGroup(change.data as any as IMarkerLink)
        this.childComponentsChange( {data:mg, action:"add"});
        break;
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
    if (found) return true;
    
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
    if (found) return true;
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
          parent._commit_child_items = this._mgSub.value();
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
