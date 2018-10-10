import { Component, OnInit, Input, Output,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { IViewNavEvents } from "../app-routing.module";
import  { 
  MockDataService, RestyTrnHelper, quickUuid,
  IMarker, IMarkerGroup, IPhoto, IMarkerList, IRestMarker,
} from '../providers/mock-data.service';
import { MappiMarker, MappiService, } from '../providers/mappi/mappi.service';
import { SubjectiveService } from '../providers/subjective.service';

@Component({
  selector: 'app-marker-list',
  templateUrl: './marker-list.component.html',
  styleUrls: ['./marker-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerListComponent implements OnInit {

  // layout of markerList = [gallery, list, edit, focus-marker-list]  
  public mListLayout: string;

  // PARENT Subject/Observable
  public mListSubject: BehaviorSubject<IMarkerList> = new BehaviorSubject<IMarkerList>(null);
  public markerList$: Observable<IMarkerList> = this.mListSubject.asObservable();

  // CHILDREN
  private _mgSub: {[uuid:string]: SubjectiveService<IMarkerGroup>} = {};
  public mgCollection$: {[uuid:string]:  Observable<IMarkerGroup[]>} = {};

  private done$: Subject<boolean> = new Subject<boolean>();

  @Input() mList: IMarkerList;

  constructor(
    public dataService: MockDataService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ) {
    this.dataService.ready()
    .then( ()=>{
    })
   }

  nav(item:IMarkerList){
    // this.router.navigate(['/home', {uuid: item.uuid}]);
    console.log("click: nav to item=", item.uuid)
    this.router.navigateByUrl(`/home/${item.uuid}`);
  }

  ngOnInit() {
    this.mListLayout = this.mListLayout || 'gallery';
  }

  ngOnDestroy(){
    console.warn("MarkerList onDestroy")
    this.done$.next(true);
  }



  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;    
      switch(k){
        case 'mList':
          if (!change.currentValue) return;
          const mList = change.currentValue;
          const doChangeDetection = mList._detectChanges;
          delete mList._detectChanges;
          this.dataService.ready()
          .then( ()=>{
            
            const childSubj = this.loadMarkerGroups(mList);
            const done = childSubj.watch$()
              .pipe(takeUntil(this.done$))
              .subscribe( items=>{
              items.forEach( mg=>this.cacheDescendents(mg) )
              // items.forEach( o=>console.log(`uuid:${mList.uuid} markerGroupId:`, o))
            });
            this.mListSubject.next(mList);
            if (doChangeDetection) setTimeout(()=>this.cd.detectChanges())
          });
          break;
        case 'mListLayout':

          break;
        case 'mListFocus':

          break;
      }
    });
  }

  loadMarkerGroups(mList:IMarkerList):SubjectiveService<IMarkerGroup> {

    const subject = this.cacheDescendents(mList) as SubjectiveService<IMarkerGroup>;
    this._mgSub[mList.uuid] = subject;
    this.mgCollection$[mList.uuid] = subject.watch$();

    return subject
  }

  getSubjByParentUuid_Watch$ = (uuid:string)=>{
    const found = MockDataService.getSubjByParentUuid(uuid)
    return found && found.watch$();
  }

  cacheDescendents(parent:any):SubjectiveService<IMarker> {
    const found = MockDataService.getSubjByParentUuid(parent.uuid);
    if (found)
      return found;  

    let subject:SubjectiveService<IMarker>;
    if (parent.hasOwnProperty('markerGroupIds')) {
      subject = new SubjectiveService(this.dataService.MarkerGroups);
      subject.get$(parent.markerGroupIds);
    } else if (parent.hasOwnProperty('markerItemIds')) {
      subject = new SubjectiveService(this.dataService.Photos);
      subject.get$(parent.markerItemIds);
    } else 
      return null;

    MockDataService.getSubjByParentUuid(parent.uuid, subject);
    return subject
  }



  toggleEditMode(action:string) {
    // if (this.mListLayout != "focus-marker-list") {
    //   this["_stash_mListLayout"] = this.mListLayout;
    //   this.mListLayout = "focus-marker-list";

    //   // hide all MarkerGroupComponents that are not in layout="focus-marker-list" mode
    //   this.mListFocusChange.emit( this.mListSubject.value )      
    // }
    // else {
    //   this.applyChanges(action)
    //   .then( 
    //     res=>{
    //       this.mListLayout = this["_stash_mListLayout"];
    //       this.mListFocusChange.emit( null );
    //     },
    //     err=>console.log('ERROR saving changes')
    //   )
    // }
    console.log(`MarkerGroupComponent: ${this.mListSubject.value.label},  mListLayout=${this.mListLayout} `)
  removeMarkerGroup(o:IMarkerList){
    this.mListChange.emit( {data:o, action:'remove'} );
  }

  // BUG: after reorder, <ion-item-options> is missing from dropped item
  reorderMarkerGroup(ev){
    const mL = this.mListSubject.value;
    const mgSubj = this._mgSub[mL.uuid]; 
    const {from, to} = ev.detail;
    const copy = RestyTrnHelper.getCachedMarkers(mgSubj.value(), 'visible')
    let move = copy.splice(from,1);
    copy.splice( to, 0, move[0]);

    // re-index after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = copy[i];
      o.seq=i;
      RestyTrnHelper.childComponentsChange({data:o, action:'move'}, mgSubj )
    }
    
    mgSubj.next(RestyTrnHelper.getCachedMarkers(mgSubj.value()) as IMarkerGroup[]);
  }
  


   /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  childComponentsChange( change: {data:IRestMarker, action:string}){
    if (!change.data) return;
    const ml = change.data;
    switch(change.action){
      case 'selected':
        // this._selectedMarkerGroup = mg.uuid;
        break;
      case 'add':
        ml['_rest_action'] = 'post';
        return;
      case 'update_marker':
        return;   
      case 'update':
        ml['_rest_action'] = ml['_rest_action'] || 'put';
        return;    
      case 'remove':
        ml['_rest_action'] = 'delete';
        return;
    }
  }



  private asPositionLabel = MappiMarker.asPositionLabel;


}
