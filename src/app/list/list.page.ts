import { Component, OnInit, Input, Output, ViewChild,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { filter, skipWhile, takeUntil } from 'rxjs/operators';

import { IViewNavEvents } from "../app-routing.module";
import  { 
  MockDataService, RestyTrnHelper, quickUuid,
  IMarker, IMarkerGroup, IPhoto, IMarkerList, IRestMarker,
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';
import { MarkerGroupComponent } from '../marker-group/marker-group.component';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';
import { GoogleMapsHostComponent } from '../google-maps/google-maps-host.component';
import { MappiMarker } from '../providers/mappi/mappi.service';
import { AppConfig } from '../providers/helpers';



@Component({
  selector: 'app-list',
  templateUrl: 'list.page.html',
  styleUrls: ['list.page.scss']
})
export class ListPage implements OnInit {
  
  public layout: string;
  public mListCollection$ : Observable<IMarkerList[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {};

  @ViewChild('gmap') map: GoogleMapsComponent;

  private _mListSub: SubjectiveService<IMarkerList>;
  
  private _selectedMarkerList: string;
  public get selectedMarkerList() { return this._selectedMarkerList }
  public set selectedMarkerList(value: string) {
    this._selectedMarkerList = value;
    // console.warn( "HomePage setter: fire detectChanges() for selected", value);
    setTimeout(()=>this.cd.detectChanges())
  }

  constructor( 
    public dataService: MockDataService,
    public photoService: PhotoService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ){
    this.dataService.ready()
    .then( ()=>{
      this._mListSub = this.dataService.sjMarkerLists;
    });

    this.router.events
    .pipe( 
      takeUntil(this.unsubscribe$),
      filter( (e:Event)=>e instanceof NavigationStart) 
    )
    .subscribe( (e: NavigationStart)=>console.log("routingDestination", e.url) );

  }

  async ngOnInit() {
    this.layout = "default";
    await this.dataService.ready();
    // for async binding in view
    this.mListCollection$ = this._mListSub.watch$().pipe( skipWhile( ()=>!this.stash.activeView) );
    // initializers
    const done = this.mListCollection$.subscribe( res=>{
        // cache MarkerList Subject back-references
        res.forEach( mL=> MockDataService.getSubjByUuid(mL.uuid, this._mListSub) );
        console.info(`ListPage mLists, count=`, res.length);
        done.unsubscribe();
      });
    this.stash.activeView = true;
    this._mListSub.get$();  // get all MarkerLists, or query
  }


  viewWillEnter(){
    try {
      this.stash.activeView = true;
      this._mListSub.repeat();
      console.warn("viewWillEnter: ListPage");
    } catch (err) {console.warn(err)}    
  }

  viewWillLeave(){
    try {
      this.stash.activeView==false;
      console.warn("viewWill-Leave: ListPage");
    } catch (err) {console.warn(err)}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }

  nav(item:IMarkerList, options:any){
    // this.router.navigate(['/home', {uuid: item.uuid}]);
    console.log("click: nav to item=", item.uuid)
    this.router.navigate(['home', item.uuid], {
      queryParams:{
        layout:'edit'
      }
    });
  }

  private _getSubjectForMarkerGroups(mL:IMarkerList):SubjectiveService<IMarker>{
    return MockDataService.getSubjByParentUuid(mL.uuid);
  }

  toggleEditMode(action:string) {
    if (this.layout != "edit") {
      this.stash.layout = this.layout;
      this.layout = "edit";
      console.log("list.page.ts: layout=", this.layout)
    }
    else {
      return this.applyChanges(action)
      .then( 
        res=>{
          this.layout = this.stash.layout;
          console.log("list.page.ts: layout=", this.layout)
        },
        err=>console.log('ERROR saving changes')
      )
    }    
  }


  createOpenMarkerList(ev:any={}){
    return this.createMarkerList(undefined)
    .then( mL=>{ 
      this.nav(mL, {layout:'edit'});
    })
  }



  /**
   * create a new MarkerList from 
   *    1) a map click/location (set the map center) or 
   *    2) from the create button,
   *  specifying either a selected image or mapCenter as the marker location
   * @param data IMarker properties, specifically [loc | seq]
   * @param ev click event
   * 
   */
  createMarkerList(ev:any={}, data:any={}):Promise<IMarkerList>{
    const target = ev.target && ev.target.tagName;
    const count = data.seq || this._mListSub.value().length;
    const item:IMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');
    item.label = `Map created ${item.created.toISOString()}`;
    item.seq = count;
    const child:IMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    child.label = `Marker created ${child.created.toISOString()}`;
    child.seq = 0;
    return Promise.resolve(true)
    .then ( ()=>{
      if (target=='ION-BUTTON') {
        return this.photoService.choosePhoto(0)
        .then( (p:IPhoto)=>{
          RestyTrnHelper.setFKfromChild(child, p);
          RestyTrnHelper.setFKfromChild(item, child);
          if (MappiMarker.hasLoc(p)) {
            RestyTrnHelper.setLocFromChild(child, p);
            RestyTrnHelper.setLocFromChild(item, child);
            return;
          }
          // WARN: selected photo does not include GPS loc
          return Promise.reject("continue");
        })
      }
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
          RestyTrnHelper.setLocToDefault(item, position);
          RestyTrnHelper.setLocToDefault(child, position);
          return item;
        })
      }
      console.warn('ListPage.createMarkerGroup()',err);
    }) 
    .then( ()=>{
      RestyTrnHelper.childComponentsChange({data:item, action:'add'}, this._mListSub);
      MockDataService.getSubjByUuid(item.uuid, this._mListSub); // back reference to mListSubj

      this.publishMarkerListGroups(item);

      return item;
    });
  }

  publishMarkerListGroups(mL:IMarkerList):Promise<IMarkerList> {
    if (mL.markerGroupIds.length) {
      setTimeout( ()=>{
        const childSubj = MockDataService.getSubjByParentUuid(mL.uuid);
        const mGroups = (mL as IRestMarker)._commit_child_items || [];
        childSubj.next(mGroups);
      },200);
    }
    return Promise.resolve( mL);
  }


  /*
   * additional event handlers, possibly called from @ViewChilds
   */
  childComponentsChange( change: {data:IMarker, action:string}){
    if (!change.data) return;
    switch(change.action){
      case 'selected':
        return this.selectedMarkerList = change.data.uuid;
      default:
        return RestyTrnHelper.childComponentsChange(change, this._mListSub);
    }
  }


  applyChanges(action:string):Promise<IMarker[]> {
    return RestyTrnHelper.applyChanges(action, this._mListSub, this.dataService)
    .then( (items)=>{
      // post-save actions
      switch(action){
        case "commit":
          return this.dataService.sjMarkerLists.reload()
          .then( ()=>items )
      }
      return items;
    });
  }

}


