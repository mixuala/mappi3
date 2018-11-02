import { Component, ElementRef, EventEmitter, OnInit, OnChanges, Input, Output, ViewChild,
  Host, Optional, SimpleChange, 
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { List } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Plugins } from '@capacitor/core';


import { MockDataService, RestyTrnHelper, IMarkerGroup, IPhoto, IMarker, IRestMarker } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { MarkerGroupFocusDirective } from './marker-group-focus.directive';
import { PhotoService, IMoment, IChoosePhotoOptions } from '../providers/photo/photo.service';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { ScreenDim, AppConfig } from '../providers/helpers';
import { AppCache } from '../providers/appcache';


@Component({
  selector: 'app-marker-group',
  templateUrl: './marker-group.component.html',
  styleUrls: ['./marker-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerGroupComponent implements OnInit , OnChanges {

  // layout of MarkerGroup = [gallery, list, edit, focus-marker-group]  
  public layout: string;
  public thumbDim: string;

  // set thumbnail overflow break. 
  public miLimit:number = 3;
  public static miLimit: number;
  private stash:any = {};
  
  // PARENT Subject/Observable, single MarkerGroup
  // subject+observable work together to send MarkerGroup to view via async pipe
  public mgSubject: BehaviorSubject<IMarkerGroup> = new BehaviorSubject<IMarkerGroup>(null);
  public markerGroup$: Observable<IMarkerGroup> = this.mgSubject.asObservable();

  // CHILDREN, deprecate???, use MockDataService.getSubjByParentUuid()
  // private _miSub: {[uuid:string]: SubjectiveService<IPhoto>} = {};
  public miCollection$: {[uuid:string]:  Observable<IPhoto[]>} = {};
  private done$: Subject<boolean> = new Subject<boolean>();

  @Input() mg: IMarkerGroup;
  // layout mode of parent, enum=['edit', 'child', 'default']
  @Input() parentLayout: string;  
  @Input() mgFocus: IMarkerGroup;

  @ViewChild('markerItemList') slidingList: List;

  @Output() mgFocusChange: EventEmitter<IMarkerGroup> = new EventEmitter<IMarkerGroup>();
  @Output() mgChange: EventEmitter<{data:IMarkerGroup, action:string}> = new EventEmitter<{data:IMarkerGroup, action:string}>();
  @Output() thumbClick: EventEmitter<{mg:IMarkerGroup, mi:IPhoto}> = new EventEmitter<{mg:IMarkerGroup, mi:IPhoto}>();

  constructor(
    @Host() @Optional() private mgFocusBlur: MarkerGroupFocusDirective,
    public dataService: MockDataService,
    public photoService: PhotoService,
    private cd: ChangeDetectorRef,
  ) {
    this.dataService.ready();
    // this.dataService.Photos.debug = true;
   }

  ngOnInit() {
    this.layout = this.layout || 'gallery';
    ScreenDim.dim$.pipe(takeUntil(this.done$)).subscribe( dim=>{
      const [fitW, fitH] = dim.split('x').map(v=>parseInt(v));
      this.miLimit = MarkerGroupComponent.getGalleryLimit(fitW, fitH);
      this.thumbDim = ScreenDim.getThumbDim([fitW, fitH]) as string;      
    })
  }

  ngOnDestroy() {
    // NOTE: async pipe subscriptions in view are automatically unsubscribed
    // console.warn("don't forget to destroy subscriptions")
    this.done$.next(true);
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;    
      switch(k){
        case 'mg':
          if (!change.currentValue) return;
          const mg = change.currentValue;
          const doChangeDetection = mg._detectChanges;
          delete mg._detectChanges;
          // console.info("MG.ngOnChanges():",mg.uuid);

          // configure subjects and cache
          const mgSubj = MockDataService.getSubjByUuid(mg.uuid) ||
            MockDataService.getSubjByUuid(mg.uuid, new SubjectiveService(this.dataService.MarkerGroups));
          // console.warn("*** MarkerGroup.ngOnChanges: mgSubj", mgSubj.value());
          const childSubj = MockDataService.getSubjByParentUuid(mg.uuid) || 
            MockDataService.getSubjByParentUuid(mg.uuid, new SubjectiveService(this.dataService.Photos));  

          this.dataService.ready()
          .then( ()=>{
            // this._miSub[mg.uuid] = childSubj as SubjectiveService<IPhoto>;
            this.miCollection$[mg.uuid] = (childSubj as SubjectiveService<IPhoto>).get$(mg.markerItemIds);
            this.mgSubject.next(this.mg); // set value for view

            // const check = MockDataService.subjectCache;

            // init owner data
            mg.favorite = mg.favorite || false;  
            this.toggleFavorite(null, mg); // initializes view component

            if (doChangeDetection) 
              setTimeout(()=>this.cd.detectChanges(), 10);
          });
          break;
        case 'parentLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.parentLayoutChanged()
          break;
        case 'mgFocus':
          if (!this.mgFocusBlur) break;
          const focus = change.currentValue;
          const hide = focus && this.mg.uuid != focus.uuid || false
          this.mgFocusBlur.blur(hide)
          break;
      }
    });
  }

  static getGalleryLimit(screenWidth:number, screenHeight:number):number{
    if (!MarkerGroupComponent.miLimit) {
      let clientWidth = Math.min(screenHeight, screenWidth);
      if (clientWidth < screenWidth){
        clientWidth = screenWidth * 0.5;
      }
      const thumbsize = screenWidth < 768 ? 56 : 80;
      const limit = Math.floor( (clientWidth - (50+16)) / thumbsize);
      MarkerGroupComponent.miLimit = limit;
      console.log("gallery thumbnail limit=", limit);
    }
    return MarkerGroupComponent.miLimit;
  }

  parentLayoutChanged(){
    // propagate layout change to MarkerGroupComponent (child)
    if (this.parentLayout == "edit") {
      this.stash.layout = this.layout;
      this.layout = "edit";
    }
    else if (this.parentLayout == "share") {
      this.layout = "share";
    }
    else this.layout = this.stash.layout;
  }

  toggleEditMode(action:string) {
    if (this.layout != "focus-marker-group") {
      this.stash.layout = this.layout;
      this.layout = "focus-marker-group";
      // hide all MarkerGroupComponents that are not in layout="focus-marker-group" mode
      this.mgFocusChange.emit( this.mg )      
    }
    else {
      this.applyChanges(action)
      .then( 
        res=>{
          this.layout = this.stash.layout;
          this.mgFocusChange.emit( null );
        },
        err=>console.log('ERROR saving changes')
      )
    }
    console.log(`MarkerGroupComponent: ${this.mg.label},  mgLayout=${this.layout} `)
  }

  selectMarkerGroup(o:IMarkerGroup){
    this.mgChange.emit({data:o, action:'selected'});
  }

  thumbClicked(mg:IMarkerGroup, mi:IPhoto){
    this.selectMarkerGroup(mg)
    this.thumbClick.emit({mg, mi});
  }

  toggleFavorite(value?:boolean, mg?:IMarkerGroup){
    mg = mg || this.mg;
    if (!mg) return

    if (!this.stash.hasOwnProperty('favorite')) {
      // sync view with data
      this.stash.favorite = mg.favorite;
      return;
    }
    this.stash.favorite = value != null ? value : !this.stash.favorite;
    mg.favorite = this.stash.favorite;
    this.mgChange.emit( {data:mg, action:'favorite'} );  // => SharePage.childComponentsChange()
    this.mgSubject.next(mg);
  }


  createMarkerItem(ev:any, provider?:string){
    const mg = this.mg;
    const photos = MockDataService.getSubjByParentUuid(mg.uuid).value() as IPhoto[];
    let moments:IMoment[] = photos.reduce( (res,p)=>{
      const moment = AppCache.findMomentByItemId(p.camerarollId);
      if (moment) res.push(moment);
      return res;
    }, []);
    const except = photos.map(o=>o.camerarollId);
    const bounds = AppConfig.map.getBounds(); 
    const options:IChoosePhotoOptions = {except, moments, bounds, provider};
    return this.photoService.choosePhoto(mg.markerItemIds.length, options)
    .then( photo=>{
      console.log( "### MarkerGroup.choosePhoto, photo=",photo, AppCache.for('Cameraroll').get(photo.camerarollId))

      this.childComponentsChange({data:photo, action:'add'});
      if (MappiMarker.hasLoc(photo)) 
        return photo;

      // no IPhoto returned, get a placeholder
      return GoogleMapsHostComponent.getCurrentPosition()
      .then( (latlng:google.maps.LatLng)=>{
        const position = latlng.toJSON();
        console.warn("create Photo with default position", position);
        RestyTrnHelper.setLocToDefault(photo, position);
        return photo;
      });
    })    
    .then( photo=>{
      setTimeout(()=>this.cd.detectChanges(),10)
    })
  }

  // called by (click)="removeMarkerGroup(marker)", 
  // send notification to Parent Component for handling
  removeMarkerGroup(o:IMarkerGroup){
    const mg = o;
    this.debug("removeMarkerGroup(): id=", mg.label);
    this.mgChange.emit( {data:mg, action:'remove'} );
  }

  // BUG: after reorder, <ion-item-options> is missing from dropped item
  reorderMarkerItem(ev){
    const mg = this.mg;
    const {from, to} = ev.detail;
    // make changes to local copy, not resty/DB
    // localCopy includes o._rest_action='delete' items because from,to index includes the same
    const copy = this._getCachedMarkerItems(mg)
    let move = copy.splice(from,1);
    copy.splice( to, 0, move[0]);

    // re-index each IPhoto after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = copy[i];
      o.seq=i;
      this.childComponentsChange({data:o, action:'move'})
    }

    // update MarkerGroup FKs
    mg.markerItemIds = RestyTrnHelper.getCachedMarkers(copy, 'visible').map(o=>o.uuid);
    this.mgChange.emit( {data:mg, action:'update'});

    // push changes
    MockDataService.getSubjByParentUuid(this.mg.uuid).next(this._getCachedMarkerItems(mg));
  }


  /*
   * additional event handlers
   */ 

  // handle childComponent/Photo changes
  childComponentsChange( change: {data:IPhoto, action:string}){
    if (!change.data) return;
    const parent:IMarkerGroup = this.mg;
    const childSubj = MockDataService.getSubjByParentUuid(parent.uuid);
    switch(change.action){
      case 'remove':
        parent.markerItemIds = parent.markerItemIds.filter(uuid=>uuid!=change.data.uuid);
        RestyTrnHelper.childComponentsChange(change, childSubj);

        // BUG: ion-item-sliding
        // see: https://github.com/ionic-team/ionic/issues/15486#issuecomment-419924318
        return this.slidingList.closeSlidingItems();
      case 'add':
        // update MarkerGroup FKs
        parent.markerItemIds.push(change.data.uuid);
        this.mgChange.emit( {data:parent, action:'update'});
        // continue processing Child IPhoto
      default:
        RestyTrnHelper.childComponentsChange(change, childSubj);
    }
  }


  /**
   * commit markerItem/IPhoto changes
   * called by MarkerGroupComponent.toggleEditMode(), commit/rollback from focus-marker-group
   * @param action 
   */
  async applyChanges(action:string):Promise<IMarker[]>{
    const mg = this.mg;

    const parent = this.mg;
    const parentSubj = MockDataService.getSubjByUuid(parent.uuid);

    // is this a deeplinking problem???
    const found = parentSubj.value().find(o=>o.uuid == parent.uuid);
    if (!found) parentSubj.next([parent]);

    const childSubj = MockDataService.getSubjByParentUuid(parent.uuid);
    const commitSubj:SubjectiveService<IRestMarker> = parent._rest_action ? parentSubj : childSubj;
    // begin commit from MarkerGroup or MarkerList
    switch (action) {
      case "commit":
        // propagate changes to MarkerGroup
        const childSubjUuids = childSubj.value().map(o => o.uuid);
        try {
          if (parent._rest_action) {
            parent.markerItemIds = childSubjUuids;
            parent._rest_action = parent._rest_action || 'put';
            parent._commit_child_items = childSubj.value().filter(o=>!!o['_rest_action']);
            console.warn( "MarkerGroup.applyChanges, commit from", commitSubj.className )
          }
          const committed = await RestyTrnHelper.applyChanges(action, commitSubj, this.dataService);
          // reload subj in RestyTrnHelper._childComponents_CommitChanges()
          console.warn("MarkerGroup: COMMIT complete", committed);
          // commitSubj.reload() called in RestyTrnHelper.applyChanges()
          // if (commitSubj == parentSubj) childSubj.reload();
          return Promise.resolve(committed);
        } catch (err) {
          console.warn("Error: cannot save to DEV MarkerGroup, parent is null");
          return Promise.reject(err);
        }
        break;
      case "rollback":
        // reload tree
        commitSubj.reload();
        if (commitSubj == childSubj) parentSubj.reload();
        return 
    }  
  }

  private _getCachedMarkerItems(mg: IMarkerGroup, option?:string):IPhoto[] {
    let items:IRestMarker[] = MockDataService.getSubjByParentUuid(mg.uuid).value();
    return RestyTrnHelper.getCachedMarkers(items, option) as IPhoto[];
  }  

  // DEV Helpers

  // serialize
  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
  }

  private asPositionLabel = MappiMarker.asPositionLabel;

  private asLocalTime(p:IPhoto):Date {
    let getTzOffset = function(loc:[number,number]):number {
      // get timezone offset from location
      // let offset = res.dstOffset + res.rawOffset;
      return -3600;
    }
    let offset = getTzOffset(p.loc);
    let d = new Date(p.dateTaken);
    d.setTime( d.getTime() + offset*1000 );
    return d;
  }


  private debug(...msg) {
    console.log(msg)
  }


}

