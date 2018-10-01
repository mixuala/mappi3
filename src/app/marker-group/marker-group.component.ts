import { Component, EventEmitter, OnInit, OnChanges, Input, Output, 
  Host, HostBinding, Optional, SimpleChange, 
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Observable, Subscription, BehaviorSubject } from 'rxjs';
import { Plugins } from '@capacitor/core';


import { MockDataService, quickUuid, IMarkerGroup, IPhoto } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { MarkerGroupFocusDirective } from './marker-group-focus.directive';
import { PhotoService, IExifPhoto } from '../providers/photo/photo.service';
import { MappiMarker } from '../providers/mappi/mappi.service';

const { Device } = Plugins;


@Component({
  selector: 'app-marker-group',
  templateUrl: './marker-group.component.html',
  styleUrls: ['./marker-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerGroupComponent implements OnInit , OnChanges {

  // layout of wiwMarkerGroup = [gallery, list, edit, focus-marker-group]  
  public mgLayout: string;
  // set thumbnail overflow break. 
  // TODO: set according to element width, inject ElementRef
  public miLimit:number = 3;  
  
  // PARENT Subject/Observable
  public mgSubject: BehaviorSubject<IMarkerGroup> = new BehaviorSubject<IMarkerGroup>(null);
  public markerGroup$: Observable<IMarkerGroup> = this.mgSubject.asObservable();

  // CHILDREN
  private _miSub: {[uuid:string]: SubjectiveService<IPhoto>} = {};
  public miCollection$: {[uuid:string]:  Observable<IPhoto[]>} = {};

  @Input() mg: IMarkerGroup;
  @Input() mListLayout: string;  // enum=['edit', 'default']
  @Input() mgFocus: IMarkerGroup;

  @Output() mgFocusChange: EventEmitter<IMarkerGroup> = new EventEmitter<IMarkerGroup>();
  @Output() mgChange: EventEmitter<{data:IMarkerGroup, action:string}> = new EventEmitter<{data:IMarkerGroup, action:string}>();

  constructor(
    @Host() @Optional() private mgFocusBlur: MarkerGroupFocusDirective,
    public dataService: MockDataService,
    public photoService: PhotoService,
    private cd: ChangeDetectorRef,
  ) {
    this.dataService.ready()
    .then( ()=>{
      // this.miCollection$ = this.dataService.markerCollSubjectDict;
    })
    // this.dataService.Photos.debug = true;
   }

  ngOnInit() {
    this.mgLayout = this.mgLayout || 'gallery';
    // console.log("MarkerGroupComponent.ngOnInit(): mglayout=", this.mgLayout)
    // this.markerGroup$.subscribe( o=>{
    //   console.info("next() markerGroup$", o);
    // })
  }

  ngOnDestroy() {
    // Only need to unsubscribe if its a multi event Observable
    console.warn("don't forget to destroy the miCollection$ subscriptions", this.miCollection$)
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
          this.dataService.ready()
          .then( ()=>{
            const subject = new SubjectiveService(this.dataService.Photos);
            this._miSub[mg.uuid] = subject
            this.miCollection$[mg.uuid] = subject.get$(mg.markerItemIds);
            this.dataService.markerCollSubjectDict[mg.uuid] = subject;
            // this.miCollection$[mg.uuid].subscribe( items=>{
            //   if (items.length>2)
            //     console.warn(`>>> photo$ for mg: ${mg.label || mg.seq}: count=${items.length}`)
            // });
            this.mgSubject.next(mg);
            if (doChangeDetection) setTimeout(()=>this.cd.detectChanges())
          });
          break;
        case 'mListLayout':
          // console.log("MarkerGroupComponent.ngOnChanges(): layout=", change["currentValue"])
          this.mListLayoutChanged()
          break;
        case 'mgFocus':
          if (!this.mgFocusBlur) break;
          const focus = change.currentValue;
          const hide = focus && this.mgSubject.value.uuid != focus.uuid || false
          // console.log(`** mgFocusChange: ${this.marker.label} hideen=${hide}`)
          this.mgFocusBlur.blur(hide)
          break;
      }
    });
  }

  mListLayoutChanged(){
    // propagate layout change to MarkerGroupComponent (child)
    if (this.mListLayout == "edit") {
      self["_stash_mgLayout"] = this.mgLayout;
      this.mgLayout = "edit";
    }
    else this.mgLayout = this["_stash_mgLayout"];
  }

  toggleEditMode(action:string) {
    if (this.mgLayout != "focus-marker-group") {
      this["_stash_mgLayout"] = this.mgLayout;
      this.mgLayout = "focus-marker-group";

      // hide all MarkerGroupComponents that are not in layout="focus-marker-group" mode
      this.mgFocusChange.emit( this.mgSubject.value )      
    }
    else {
      this.applyChanges(action)
      .then( 
        res=>{
          this.mgLayout = this["_stash_mgLayout"];
          this.mgFocusChange.emit( null );
        },
        err=>console.log('ERROR saving changes')
      )
    }
    console.log(`MarkerGroupComponent: ${this.mgSubject.value.label},  mgLayout=${this.mgLayout} `)
  }

  selectMarkerGroup(o:IMarkerGroup){
    this.mgChange.emit({data:o, action:'selected'});
  }

  createMarkerItem(ev:any){
    const mg = this.mgSubject.value;
    return this.photoService.choosePhoto(mg.markerItemIds.length)
    .then( p=>{
      this.childComponentsChange({data:p, action:'add'})
      return mg;
    })
  }

  removeMarkerGroup(o:IMarkerGroup){
    this.debug("removeMarkerGroup(): id=", o.label);
    this.mgChange.emit( {data:o, action:'remove'} );
  }

  // BUG: after reorder, <ion-item-options> is missing from dropped item
  reorderMarkerItem(ev){
    const mg = this.mgSubject.value;
    const {from, to} = ev.detail;
    const copy = this._getCachedMarkerItems(mg, 'visible')
    let move = copy.splice(from,1);
    copy.splice( to, 0, move[0]);

    // re-index after move
    for (let i=Math.min(from,to);i<=Math.max(from,to);i++){
      const o = copy[i];
      o.seq=i;
      this.childComponentsChange({data:o, action:'move'})
    }
    this._miSub[mg.uuid].next(this._getCachedMarkerItems(mg));
  }


  /*
   * additional event handlers
   */ 
  childComponentsChange( change: {data:IPhoto, action:string}){
    if (!change.data) return;
    // let mi = this._markerItems[change.data.uuid];
    const mi = change.data;
    const mg = this.mgSubject.value;
    switch(change.action){
      case 'add':  
        const newMi = change.data;      
        newMi['_rest_action'] = 'post';
        
        let items = this._getCachedMarkerItems(mg);
        items.push(newMi);
        if (mg.markerItemIds.length==0) {
          if (mg["_loc_was_map_center"]){
            mg.loc = [newMi.position.lat, newMi.position.lng];
            mg.locOffset = [0,0];
            mg.position = newMi.position;
            delete mg["_loc_was_map_center"];
            this.mgChange.emit( {data:mg, action:'update_marker'} );
            console.info("MarkerGroupComponent: reset position of markerGroup to photo.loc=", newMi.loc, mg );
          }
        }
        mg.markerItemIds = items.map(o=>o.uuid);

        this._miSub[mg.uuid].next(items);
        break;
      case 'update':
        mi['_rest_action'] = mi['_rest_action'] || 'put';
        break;
      case 'move':
        mi['_rest_action'] = mi['_rest_action'] || 'put';
        break;
      case 'remove':
        mi['_rest_action'] = 'delete';
        items = this._getCachedMarkerItems(mg); 
        this._miSub[mg.uuid].next(items);
        break;
    }
  }

  childComponents_CommitChanges(items:IPhoto[]):Promise<any>{
    const children:Promise<any>[] = items.map( o=>{
      const restAction = o._rest_action;
      delete o._rest_action;
      switch(restAction) {
        case "post":
          return this.dataService.Photos.post(o);
        case "put":
          return this.dataService.Photos.put(o.uuid, o);
        case "delete":
          return this.dataService.Photos.delete(o.uuid)
          .catch(err=>{
            // will return `false` if we try to delete an item 
            // that was not yet committed to dB
            if (err===false) return Promise.resolve(true)
            return Promise.reject(err);
          });
      }
    });
    return Promise.all(children);    
  }

  applyChanges(action:string):Promise<any>{
    const mg = this.mgSubject.value;
    return Promise.resolve(mg)
    .then( mg=>{
      switch(action){
        case "commit":
          const allItems = this._getCachedMarkerItems(mg, 'commit')
          const remainingItems = this._getCachedMarkerItems(mg, 'visible')
          return this.childComponents_CommitChanges(allItems)
          .catch( err=>{
            console.error("ERROR: problem saving child nodes ");
            Promise.reject(err);
          })
          .then( res=>{
            const markerItemIds = remainingItems.map(o=>o.uuid);
            mg.markerItemIds = markerItemIds;
            // update Parent directly, mg.markerItemIds
            return this.dataService.MarkerGroups.put(mg.uuid, mg)
            .then(
              res=>{
                this.mgSubject.next(mg);
                this._miSub[mg.uuid].reload(mg.markerItemIds);
                return mg
              },
              err=>{
                console.error("ERROR: problem updating Parent node");
                Promise.reject(err);
            })
          });
        case "rollback":
          const uuids = this._getCachedMarkerItems(mg, 'rollback')
          .map( o=>o.uuid );
          this._miSub[mg.uuid].reload( uuids );
          return mg;
      }
    })
    .then( res=>{
      this.mgSubject.next(mg);
      // Propagate changes to ParentView
      this.mgChange.emit( {data:mg, action:'update_marker'} );
    })
  }

  private _getCachedMarkerItems(mg: IMarkerGroup, option?:string):IPhoto[] {
    let items = this._miSub[mg.uuid].value();
    
    if (option=='rollback') 
      items = items.filter( o=>o._rest_action!= 'post') // skip added items
    else if (option=='visible')
      items = items.filter( o=>o._rest_action!= 'delete') // skip removed items

    items.sort( (a,b)=>a.seq-b.seq );
    return items;
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

