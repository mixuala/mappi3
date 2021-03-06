import { Component, EventEmitter, OnInit, Input, Output,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto,
} from '../providers/types';
import  { 
  MockDataService, Prompt,
} from '../providers/mock-data.service';

import { RestyService } from '../providers/resty.service';
import { SubjectiveService, UnionSubjectiveService } from '../providers/subjective.service';
import { AppCache } from '../providers/appcache';
import { ScreenDim, Humanize } from '../providers/helpers';

@Component({
  selector: 'app-marker-list',
  templateUrl: './marker-list.component.html',
  styleUrls: ['./marker-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerListComponent implements OnInit {

  // layout of markerList = [gallery, list, edit, focus-marker-list]  
  public layout: string;
  public thumbDim: string;

  public humanize = Humanize;
  private stash:any = {};

  // PARENT Subject/Observable
  public mListSubject: BehaviorSubject<IMarkerList> = new BehaviorSubject<IMarkerList>(null);
  public markerList$: Observable<IMarkerList> = this.mListSubject.asObservable();

  // CHILDREN
  private _mgSub: {[uuid:string]: SubjectiveService<IMarkerGroup>} = {};
  public mgCollection$: {[uuid:string]:  Observable<IMarkerGroup[]>} = {};

  private unsubscribe$: Subject<boolean> = new Subject<boolean>();

  @Input() mList: IMarkerList;
  @Input() parentLayout: string;  
  @Input() seq: number;  

  @Output() mListChange: EventEmitter<{data:IMarkerList, action:string}> = new EventEmitter<{data:IMarkerList, action:string}>();
  @Output() thumbClick: EventEmitter<{mList:IMarkerList, mi:IPhoto}> = new EventEmitter<{mList:IMarkerList, mi:IPhoto}>();

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
    AppCache.for('Key').set(item, item.uuid);
    this.router.navigateByUrl(`/map/${item.uuid}`);
  }

  ngOnInit() {
    this.layout = this.layout || 'gallery';
    ScreenDim.dim$.pipe(takeUntil(this.unsubscribe$)).subscribe( dim=>{
      const [fitW, fitH] = dim.split('x').map(v=>parseInt(v));
      // this.miLimit = MarkerGroupComponent.getGalleryLimit(fitW, fitH);
      this.thumbDim = ScreenDim.getThumbDim([fitW, fitH]) as string;    
    })
  }

  ngOnDestroy(){
    console.warn("MarkerList onDestroy")
    this.unsubscribe$.next(true);
  }



  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;    
      switch(k){
        case 'mList':
          if (!change.currentValue) return;
          const mList = change.currentValue;
          // const doChangeDetection = mList._detectChanges;
          // delete mList._detectChanges;
          this.dataService.ready()
          .then( ()=>{
            const childSubj = this.loadMarkerGroups(mList);
            const once = childSubj.watch$().pipe(
              takeUntil(this.unsubscribe$),
            ).subscribe( items=>{
              items.forEach( mg=>this.cacheDescendents(mg));
            })
                
            this.mListSubject.next(mList);
            // if (doChangeDetection) {
            //   setTimeout(()=>this.cd.detectChanges(),10)
            // }
          });
          break;
          case 'parentLayout':
          this.parentLayoutChanged()
          break;
        case 'mListFocus':
          // if (!this.mListFocusBlur) break;
          // const focus = change.currentValue;
          // const hide = focus && this.mListSubject.value.uuid != focus.uuid || false
          // // console.log(`** mgFocusChange: ${this.marker.label} hidden=${hide}`)
          // this.mListFocusBlur.blur(hide)
          break;
      }
    });
  }


  loadMarkerGroups(mList:IMarkerList):SubjectiveService<IMarkerGroup> {
    // TODO: make this lazyloading
    console.warn("loadMarkerGroups() should be lazyloading, by chunk");
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
    console.warn("cacheDescendents() should be lazyloading, by chunk");
    const found = MockDataService.getSubjByParentUuid(parent.uuid);
    if (found)
      return found;  

    let subject:SubjectiveService<IMarker>;
    if (parent.hasOwnProperty('markerGroupIds')) {
      const restys:RestyService<IMarker>[] = [this.dataService.MarkerGroups, this.dataService.MarkerLinks ];
      subject = new UnionSubjectiveService(restys);
      subject.get$(parent.markerGroupIds);
    } else if (parent.hasOwnProperty('markerItemIds')) {
      const restys:RestyService<IMarker>[] = [this.dataService.Photos, this.dataService.MarkerLinks ];
      subject = new UnionSubjectiveService(restys);
      subject.get$(parent.markerItemIds);
    } else 
      return null;

    MockDataService.getSubjByParentUuid(parent.uuid, subject);
    return subject
  }


  parentLayoutChanged(){
    // propagate layout change to MarkerGroupComponent (child)
    if (this.parentLayout == "edit") {
      this.stash.layout = this.layout;
      this.layout = "edit";
    }
    else this.layout = this.stash.layout;
  }

  selectMarkerList(o:IMarkerList, ev?:MouseEvent){
    this.mListChange.emit({data:o, action:'selected'});
  }

  thumbClicked(mL:IMarkerList, mi:IPhoto){
    this.selectMarkerList(mL)
    this.thumbClick.emit({mList:mL, mi});
  }


  removeMarkerList(o:IMarkerList){
    this.mListChange.emit( {data:o, action:'remove'} );
  }

  async getTitle(ev:MouseEvent){
    const target = ev.target && ev.target['tagName'];
    if (ev.clientX > 100) return;
    if (target=='ION-BUTTON') return;
    const changes = await Prompt.getText('label', 'label', this.mList, this.dataService);
    if (changes && changes.length){
      this.mListChange.emit({data:this.mList, action:'prompt'})
      // this.mListSubject.next(this.mListSubject.value); // same as detectChanges()???
      this.cd.detectChanges();
    }
    
    ev.preventDefault();
  }

   /*
   * additional event handlers, possibly called from @ViewChilds
   */ 
  childComponentsChange( change: {data:IRestMarker, action:string}){
    if (!change.data) return;
    const ml = change.data;
    switch(change.action){
      case 'reload':
        this._mgSub[ml.uuid].reload();   // called by action="rollback" from child
        return;
      case 'selected':
        // this._selectedMarkerGroup = mg.uuid;
        break;
      case 'add':
        ml['_rest_action'] = 'post';
        return;
      case 'update':
        ml['_rest_action'] = ml['_rest_action'] || 'put';
        return;    
      case 'remove':
        ml['_rest_action'] = 'delete';
        return;
    }
  }
}
