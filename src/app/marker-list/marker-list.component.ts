import { Component, OnInit, Input, Output,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';

import  { 
  MockDataService, quickUuid,
  IMarker, IMarkerGroup, IPhoto, IMarkerList
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';

@Component({
  selector: 'app-marker-list',
  templateUrl: './marker-list.component.html',
  styleUrls: ['./marker-list.component.scss']
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

  @Input() mList: IMarkerList;

  constructor(
    public dataService: MockDataService,
    private cd: ChangeDetectorRef,
  ) {
    this.dataService.ready()
    .then( ()=>{
    })
   }

  ngOnInit() {
    this.mListLayout = this.mListLayout || 'gallery';
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
            childSubj.watch$().subscribe( items=>{
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
  }





}
