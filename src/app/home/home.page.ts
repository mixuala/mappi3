import { Component, OnInit, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { List } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, switchMap, skipWhile } from 'rxjs/operators';

import { IViewNavEvents } from "../app-routing.module";
import { MappiMarker, MappiService, } from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';
import  { MockDataService, RestyTrnHelper, quickUuid,
  IMarkerGroup, IPhoto, IMarker, IRestMarker, IMarkerList,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';
import { GoogleMapsComponent , IMapActions } from '../google-maps/google-maps.component';

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
  // Observable for GoogleMapsComponent
  public markerCollection$ : Observable<IMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public qrcodeData: string = null;
  public toggle:any = {};

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
      this._mgSub = this.dataService.sjMarkerGroups;
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
    // console.log("google.maps.Map", this.gmap.map)
  }

  getStaticMap(){
    const {map, key} = this.gmap;
    const markers = RestyTrnHelper.getCachedMarkers(this._mgSub.value(), 'visible');
    this.qrcodeData = GoogleMapsComponent.getStaticMap(map, key, markers );
    return
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
    // })
    
    await this.dataService.ready();
    const done = mListSub.get$([mListId])
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
      //   console.info(`HomePage ${mListId} mgs, count=`, arr.length, arr);
    })

    // window['check'] = MockDataService.subjectCache;

    // detectChanges if in `edit` mode
    const layout = this.route.snapshot.queryParams.layout;
    if ( layout=='edit' ) {
      setTimeout( ()=>{
        this.toggleEditMode('edit');
        this.cd.detectChanges();
      },100
      )
    };

  }

  viewWillEnter(){
    // this.mapSettings = Object.assign({}, this.mapSettings);
    this._mgSub.reload();
    console.log("viewWillEnter: HomePage")
  }

  viewWillLeave(){
    console.log("viewWillLeave: HomePage")
  }

  ngOnDestroy() {
    console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }


  toggleEditMode(action?:string) {
    if (this.layout != "edit" || action=='edit') {
      this.toggle.layout = this.layout;
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
      .then( 
        res=>{
          this.layout = this.toggle.layout;
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
   * create a new MarkerGroup from 1) a map click/location or 2) from the create button,
   *  specifying either a selected image or mapCenter as the marker location
   * @param data IMarker properties, specifically [loc | seq]
   * @param ev click event
   * 
   */
  async createMarkerGroup(ev:any={}, data:any={}):Promise<IMarkerGroup>{
    const target = ev.target && ev.target.tagName;
    let item:IMarkerGroup;

    let child:IPhoto;
    if (target=='ION-BUTTON')
      child = await this.photoService.choosePhoto(0);
    else if (data.className == 'Photo')
      // create markerGroup using photo as location
      child = data;

    if (child)
      item = RestyTrnHelper.getPlaceholder('MarkerGroup');
    else {
      item = RestyTrnHelper.getPlaceholder('MarkerGroup', data);
    }
    item.label = `Marker created ${item.created.toISOString()}`;
    item.seq = data.seq || this._mgSub.value().length;

    return Promise.resolve(true)
    .then ( async ()=>{
      if (child && child.loc.join() != [0,0].join()) {
        RestyTrnHelper.setFKfromChild(item, child);
        RestyTrnHelper.setLocFromChild(item, child);
        console.log("createMarkerGroup, selected Photo", child.loc, child);
      }
      if (item.loc.join() != [0,0].join()) 
        return Promise.resolve(true)
      return Promise.reject('continue');
    })
    .catch( (err)=>{
      if (err=='continue') {
        // no IPhoto returned, get a placeholder
        return Promise.resolve(true)
        .then( ()=>{
          let position = GoogleMapsComponent.map && GoogleMapsComponent.map.getCenter();
          if (position) 
            return position;
          else
            return GoogleMapsComponent.getCurrentPosition();
        })
        .then( (latlng:google.maps.LatLng)=>{
          const position = latlng.toJSON();
          console.warn("createMarkerGroup, default position", position);
          RestyTrnHelper.setLocToDefault(item, position);
          return item;
        });
      }
      console.warn(`HomePage.createMarkerGroup() `,err);
    })
    .then( ()=>{
      RestyTrnHelper.childComponentsChange({data:item, action:'add'}, this._mgSub)
      return item;
    }) 
    // .then( (options:any)=>{
    //   const mg = this._getPlaceholder(options, count);
    //   mg.label = `Marker created ${new Date().toISOString()}`
    //   // this.childComponentsChange({data:mg, action:'add'});
    //   RestyTrnHelper.childComponentsChange({data:mg, action:'add'}, this._mgSub)
    //   return mg;
    // })
    .then( (item:IMarkerGroup)=>{
      this.emitMarkerGroupItem(item)
      return item;
    });
  }

  emitMarkerGroupItem(mg:IMarkerGroup):Promise<IMarkerGroup> {
    if (mg.markerItemIds.length) {
      // NOTE: this subject is NOT created until the MarkerItem is rendered
      setTimeout( ()=>{
        const subject = this._getSubjectForMarkerItems(mg);
        if (!subject) console.warn("ERROR: possible race condition when creating MarkerGroup from IPhoto")
        const photo = mg['_commit_child_item'];
        subject.next([photo])
      },100)
    }
    return Promise.resolve(mg);
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

  applyChanges(action: string): Promise<IMarker[]> {
    return RestyTrnHelper.applyChanges(action, this._mgSub, this.dataService)
    .then( (items)=>{
      // post-save actions
      switch (action) {
        case "commit":
          // propagate changes to MarkerList
          const itemUuids = this._mgSub.value().map(o => o.uuid);
          try {
            const parentMgUuids = this.parent.markerGroupIds;
            if (
              this.parent["_rest_action"] ||
              itemUuids.length != parentMgUuids.length ||
              itemUuids.filter(v => !parentMgUuids.includes(v)).length > 0
              ) {
                this.parent.markerGroupIds = itemUuids;
                this.parent['_rest_action'] = this.parent['_rest_action'] || 'put'
                const subject = this.dataService.sjMarkerLists;
                return RestyTrnHelper.applyChanges(action, subject, this.dataService);
              }
          } catch (err){
            console.warn("Error: cannot save to DEV MarkerGroup, parent is null")
          }
        case "rollback":
          const layout = this.route.snapshot.queryParams.layout;
          if ( layout=='edit' )
            this.router.navigateByUrl('list');
          break;
      }
      return items;
    });

  }

  private obj2String(o) {
    let kv = Object.entries(o).reduce( (a,v)=> {a.push(v.join(':')); return a} ,[])
    return `{ ${kv.join(', ')} }`
  }
  private debug(...msg) {
    console.log(msg)
  }


}
