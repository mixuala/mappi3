import { Component, ElementRef, EventEmitter, OnInit, OnChanges, Input, Output, ViewChild,
  Host, HostListener, Optional, SimpleChange, 
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { List } from '@ionic/angular';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';
import { Plugins } from '@capacitor/core';

import { AppComponent } from '../app.component';
import { MockDataService, RestyTrnHelper, IMarkerGroup, IPhoto, IMarker, IRestMarker } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { MarkerGroupFocusDirective } from './marker-group-focus.directive';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';

const { Device } = Plugins;


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
  public fullscreenDim: string;

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

  @Input() mg: IMarkerGroup;
  // layout mode of parent, enum=['edit', 'child', 'default']
  @Input() parentLayout: string;  
  @Input() mgFocus: IMarkerGroup;

  @ViewChild('markerItemList') slidingList: List;

  @Output() mgFocusChange: EventEmitter<IMarkerGroup> = new EventEmitter<IMarkerGroup>();
  @Output() mgChange: EventEmitter<{data:IMarkerGroup, action:string}> = new EventEmitter<{data:IMarkerGroup, action:string}>();
  @Output() thumbClick: EventEmitter<{mg:IMarkerGroup, mi:IPhoto}> = new EventEmitter<{mg:IMarkerGroup, mi:IPhoto}>();

  @HostListener('window:resize', ['$event'])
  onResize(event?, reset=true) {
    if (reset) MarkerGroupComponent.miLimit=null;
    this.miLimit = MarkerGroupComponent.getGalleryLimit(window.innerWidth, window.innerHeight);
    const thumbsize = window.innerWidth < 768 ? 56 : 80;
    this.thumbDim = `${thumbsize}x${thumbsize}`;
  }

  constructor(
    @Host() @Optional() private mgFocusBlur: MarkerGroupFocusDirective,
    public dataService: MockDataService,
    public photoService: PhotoService,
    private element: ElementRef, 
    private cd: ChangeDetectorRef,
  ) {
    this.onResize(undefined, false);
    this.dataService.ready();
    // this.dataService.Photos.debug = true;
   }

  ngOnInit() {
    this.layout = this.layout || 'gallery';
  }

  ngOnDestroy() {
    // NOTE: async pipe subscriptions in view are automatically unsubscribed
    // console.warn("don't forget to destroy subscriptions")
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


  createMarkerItem(ev:any){
    const mg = this.mg;
    return this.photoService.choosePhoto(mg.markerItemIds.length)
    .then( photo=>{
      this.childComponentsChange({data:photo, action:'add'});
      if (MappiMarker.hasLoc(photo)) 
        return photo;

      // no IPhoto returned, get a placeholder
      return GoogleMapsComponent.getCurrentPosition()
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

  removeMarkerGroup(o:IMarkerGroup){
    this.debug("removeMarkerGroup(): id=", o.label);
    this.mgChange.emit( {data:o, action:'remove'} );
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

    // re-index after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = copy[i];
      o.seq=i;
      this.childComponentsChange({data:o, action:'move'})
    }
    MockDataService.getSubjByParentUuid(this.mg.uuid).next(this._getCachedMarkerItems(mg));
  }


  /*
   * additional event handlers
   */ 
  childComponentsChange( change: {data:IPhoto, action:string}){
    if (!change.data) return;
    const parent = this.mg;
    const childSubj = MockDataService.getSubjByParentUuid(parent.uuid);
    switch(change.action){
      case 'remove':
        RestyTrnHelper.childComponentsChange(change, childSubj);

        // BUG: ion-item-sliding
        // see: https://github.com/ionic-team/ionic/issues/15486#issuecomment-419924318
        return this.slidingList.closeSlidingItems();
      default:
        return RestyTrnHelper.childComponentsChange(change, childSubj);
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
    const childSubj = MockDataService.getSubjByParentUuid(parent.uuid);
    // begin commit from MarkerGroup
    switch (action) {
      case "commit":
        // propagate changes to MarkerGroup
        let commitSubj:SubjectiveService<IRestMarker>;
        const childSubjUuids = childSubj.value().map(o => o.uuid);
        try {
          if ( 
            // check if MarkerGroup stale, if markerItemIds are not equal
            parent._rest_action ||
            childSubjUuids.length != parent.markerItemIds.length ||
            childSubjUuids.filter(v => !parent.markerItemIds.includes(v)).length > 0
          ) {
            parent.markerItemIds = childSubjUuids;
            parent._rest_action = parent._rest_action || 'put';
            parent._commit_child_items = childSubj.value().filter(o=>!!o['_rest_action']);
            commitSubj = parentSubj;
            console.warn( "MarkerGroup.applyChanges, commit from", commitSubj.className )
          }
          else {
            // markerGroup not changed, just update markerItems
            commitSubj = childSubj;
          }
          const committed = await RestyTrnHelper.applyChanges(action, commitSubj, this.dataService);
          console.warn("MarkerGroup: committed", committed);
          // subject.reload() called in RestyTrnHelper.applyChanges()
          return Promise.resolve(committed);
        } catch (err) {
          console.warn("Error: cannot save to DEV MarkerGroup, parent is null");
          return Promise.reject(err);
        }
        break;
      case "rollback":
        childSubj.reload();
        return parentSubj.reload( );
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

