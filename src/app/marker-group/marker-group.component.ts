import { Component, ElementRef, EventEmitter, OnInit, OnChanges, Input, Output, ViewChild,
  Host, Optional, SimpleChange, 
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { List } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto, IMarkerLink,
  IMoment, IChoosePhotoOptions,
} from '../providers/types';
import { MockDataService, RestyTrnHelper, Prompt, } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { MarkerGroupFocusDirective } from './marker-group-focus.directive';
import { PhotoService,  } from '../providers/photo/photo.service';
import { CamerarollPage } from '../cameraroll/cameraroll.page';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { AppConfig, ScreenDim, Humanize, } from '../providers/helpers';
import { Hacks} from '../providers/hacks';
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
  public humanize = Humanize;
  private stash:any = {
    favorite: false
  };
  
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


  /**
   * uncommitted data is LOST when you call childSubj.reload$() or .get$()
   * - use childSubj.watch$()
   * @param mg 
   */
  inflateUncommittedMarker(mg:IMarkerGroup):boolean{
    // recurse through tree, add IMarkers which have not been committed to DB
    if (!mg || mg['_rest_action'] != 'post') return false;

    const mis = mg['_commit_child_items'] || [];
    const childSubj = MockDataService.getSubjByParentUuid(mg.uuid) ||  
          MockDataService.getSubjByParentUuid(mg.uuid, new SubjectiveService(this.dataService.Photos));
    childSubj.next(mis);
    return true;
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

          const isUncomittedMarker = this.inflateUncommittedMarker(this.mg);
          // configure subjects and cache
          const childSubj = MockDataService.getSubjByParentUuid(mg.uuid) || 
                MockDataService.getSubjByParentUuid(mg.uuid, new SubjectiveService(this.dataService.Photos));  
          
          this.dataService.ready()
          .then( ()=>{
            // this._miSub[mg.uuid] = childSubj as SubjectiveService<IPhoto>;
            const photoSubj = (childSubj as SubjectiveService<IPhoto>);
            this.miCollection$[mg.uuid] =  isUncomittedMarker ? photoSubj.watch$() : photoSubj.get$(mg.markerItemIds);
            if (mg.markerItemIds.includes(mg.uuid)) {
              // patch add markerList IMG without creating Photo
              this.miCollection$[mg.uuid].pipe(takeUntil(this.done$)).subscribe( items=>{
                if (items.length < mg.markerItemIds.length){
                  const i = mg.markerItemIds.findIndex( id=>id==mg.uuid);
                  items = items.splice(i,0,mg);
                }
              });
            }
            this.mgSubject.next(this.mg); // set value for view

            const isMarkerLink = !!mg['url'];
            if (isMarkerLink){
              switch (this.layout){
                case 'share': this.layout = "link-share"; break;
                case 'gallery': this.layout = "link-edit"; break;
              }
              mg['_pub_date'] = mg.updated_time && new Date(mg.updated_time*1000).toDateString();
              mg['site_name'] = mg['site_name'] || mg.url.split('/')[2];
            }

            // init owner data
            this.stash.favorite = mg['_favorite'] = mg['_favorite'] || false;

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
    else if (['share', 'select'].includes(this.parentLayout)) {
      this.layout = this.parentLayout;
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
        err=>console.log('ERROR saving changes',err)
      )
    }
    console.log(`MarkerGroupComponent: ${this.mg.label},  mgLayout=${this.layout} `)
  }

  // called by ion-icon[pin](click) and thumbClicked below
  selectMarkerGroup(o:IMarkerGroup, ev?:MouseEvent){
    this.mgChange.emit({data:o, action:'selected'});
  }

  thumbClicked(mg:IMarkerGroup, mi:IPhoto){
    this.thumbClick.emit({mg, mi}); // pass it up
  }

  toggleFavorite(value?:boolean, mg?:IMarkerGroup){
    mg = mg || this.mg;
    if (!mg) return
    value = value || !mg['_favorite'];
    this.stash.favorite = mg['_favorite'] = value;
    this.mgChange.emit( {data:mg, action:'favorite'} );  // => SharePage.childComponentsChange()
    this.mgSubject.next(mg);
  }

  toggleSelected(value?:boolean, mg?:IMarkerGroup){
    mg = mg || this.mg;
    if (!mg) return
    value = value || !mg['_selected'];
    this.stash.selected = mg['_selected'] = value;
    this.mgChange.emit( {data:mg, action:'selected'} );  // => SharePage.childComponentsChange()
    this.mgSubject.next(mg);
  }

  openLink(marker:IMarker){
    this.mgChange.emit( {data:marker as IMarkerGroup, action:'open-link'} );  // => SharePage.childComponentsChange()
  }

  /**
   * create a new MarkerItem from CamerarollPage Modal
   * @param selected IPhoto[], expecting IPhoto._moment: IMoment
   */
  async createMarkerItems_fromCameraroll(selected:IPhoto[]){
    let default_position = AppConfig.map.getCenter() || await GoogleMapsHostComponent.getCurrentPosition();
    selected.forEach( (photo)=>{
      this.childComponentsChange({data:photo, action:'add'});
      if (MappiMarker.hasLoc(photo)==false){
        RestyTrnHelper.setLocToDefault(photo, default_position);
      }
    });
    setTimeout(()=>this.cd.detectChanges(),10);
  }



  createMarkerItem(ev:any, provider?:string){
    const target = ev.target && ev.target.tagName;
    const mg = this.mg;
    const photos = MockDataService.getSubjByParentUuid(mg.uuid).value() as IPhoto[];
    let moments:IMoment[] = photos.reduce( (res,p)=>{
      const moment = AppCache.findMomentByItemId(p.camerarollId);
      if (moment) res.push(moment);
      return res;
    }, []);
    const except = photos.map(o=>o.camerarollId);
    const bounds = AppConfig.map.getBounds(); 
    if (AppConfig.device.platform=='ios' && target!='ION-BUTTON'){
      provider = 'Camera';   // override, for DEMO only
    }
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

    // see: https://github.com/ionic-team/ionic/tree/master/core/src/components/reorder-group
    ev.detail.complete && ev.detail.complete();
  }

  async getTitle(ev:MouseEvent){
    const target = ev.target && ev.target['tagName'];
    if (target!='H3') return;
    const changes = await Prompt.getText('label', 'label', this.mg, null);
    if (changes) {
      console.log("Prompt for title, mg=", changes.pop() );
      this.mgSubject.next(this.mg); // same as detectChanges()???
    }
    ev.preventDefault();
  }


  /*
   * additional event handlers
   */ 

  /**
   * reload after commit/rollback
   */
  async reload(changed:IMarker[]=[]){
    const waitFor = [];
    const found = changed.find(o=>o.uuid==this.mg.uuid);
    if (found) this.mg = found as IMarkerGroup;
    else {
      waitFor.push(  
        this.dataService.MarkerGroups.get([this.mg.uuid])
        .then( arr=>this.mg=arr.pop())
      );
    }
    // reload tree Photos < MarkerGroup
    const mItemSubj = MockDataService.getSubjByParentUuid(this.mg.uuid);
    if (mItemSubj) waitFor.push(mItemSubj.reload(this.mg.markerItemIds, true));
    await waitFor;
  }
  

  // handle childComponent/Photo changes
  childComponentsChange( change: {data:IPhoto, action:string}){
    if (!change.data) return;
    const parent:IMarkerGroup = this.mg;
    const childSubj = MockDataService.getSubjByParentUuid(parent.uuid);
    switch(change.action){
      case 'reload':
        childSubj.reload();   // called by action="rollback". reload IPhotos[]
        return;
      case 'markerLink':
        // add markerLink to current marker
        const marker = Hacks.patch_MarkerLink_as_MarkerItem(change.data as any as IMarkerLink)
        return this.childComponentsChange( {data:marker, action:"add"});       
      case 'remove':
      // just HIDE in view, do NOT remove until COMMIT
        parent.markerItemIds = parent.markerItemIds.filter(uuid=>uuid!=change.data.uuid);
        RestyTrnHelper.childComponentsChange(change, childSubj, parent.markerItemIds);
        this.mgChange.emit( {data:parent, action:'update'});        // adds parent._rest_action="put"
        // BUG: ion-item-sliding
        // see: https://github.com/ionic-team/ionic/issues/15486#issuecomment-419924318
        return this.slidingList.closeSlidingItems();
      case 'add':
        // update MarkerGroup FKs
        parent.markerItemIds = parent.markerItemIds.slice(); // make a copy
        parent.markerItemIds.push(change.data.uuid);
        this.mgChange.emit( {data:parent, action:'update'});
        return RestyTrnHelper.childComponentsChange(change, childSubj, parent.markerItemIds);
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
    const childSubj = MockDataService.getSubjByParentUuid(mg.uuid);

    // begin commit from MarkerGroup or IPhoto[]
    const commitFrom = (this.mg as IRestMarker)._rest_action ? [this.mg] : childSubj.value();
    switch (action) {
      case "commit":
        // propagate changes to MarkerItems
        const childSubjUuids = childSubj.value().map(o => o.uuid);
        // use getVisible
        try {
          if (mg._rest_action) {
            // mg.markerItemIds = childSubjUuids;
            mg._rest_action = mg._rest_action || 'put';
            mg._commit_child_items = childSubj.value().filter(o=>!!o['_rest_action']);
            console.warn( "MarkerGroup.applyChanges, commitFrom=", commitFrom )
          }
          const committed = await RestyTrnHelper.commitFromRoot(this.dataService, commitFrom);
          await this.reload(committed);
          console.warn("MarkerGroup: COMMIT complete", committed);
          return Promise.resolve(committed);
        } catch (err) {
          console.log("Error: ", err);
          return Promise.reject(err);
        }
      case "rollback":
        this.reload();
        // childSubj.reload();
        // this.mgChange.emit( {data:mg, action:'reload'} );
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

