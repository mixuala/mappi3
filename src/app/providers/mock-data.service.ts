import { Injectable } from '@angular/core';
import { Plugins } from '@capacitor/core';
import { Observable, ReplaySubject } from 'rxjs';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto,
  IMarkerSubject,
} from './types';
import { quickUuid as _quickUuid, RestyService } from './resty.service';
import { SubjectiveService } from './subjective.service';
import { MappiMarker, } from './mappi/mappi.service';
import { AppCache  } from './appcache';
import { AppConfig } from '../providers/helpers';
import { RAW_DEMO_DATA, PICSUM_IDS } from './demo_data';

const { SplashScreen, Storage } = Plugins;

export function quickUuid() {
  // re-export
  return _quickUuid();
};



@Injectable({
  providedIn: 'root'
})
export class MockDataService {

  // random sample of image sizes for placeholder photos
  static sizes:any[] = [
    [480,720],[480,720],[480,720],[480,720],[480,720],[480,720],[480,720],[480,720]
    , [720,480],[720,480],[720,480],[720,480]
    , [960,480]
  ];
  static photo_baseurl: string = "https://picsum.photos/80?image=";
  static picsumIds: number[];

  public MarkerLists:RestyService<IMarkerList>;
  public MarkerGroups:RestyService<IMarkerGroup>;
  public Photos:RestyService<IPhoto>;

  public sjMarkerLists:SubjectiveService<IMarkerList>;
  public sjMarkerGroups:SubjectiveService<IMarkerGroup>;
  public sjPhotos:SubjectiveService<IPhoto>;

  private _ready:Promise<any>;
  private static MARKER_LISTS = [];

  private _datasourceDeferred: { 
    promise:  Promise<any>, 
    resolve:  ()=>void, 
    reject:   (err:any)=>void
  };

  /**
   * helper functions
   */
  static getSubjByParentUuid(uuid:string, subj?:SubjectiveService<IMarker>){
    let markerSubj:IMarkerSubject = AppCache.for('IMarkerSubj').get(uuid);
    if (markerSubj){
      if (subj) return markerSubj.child = subj;
      return markerSubj.child;
    }

    const empty:IMarkerSubject = {uuid, sibling: null, child:null};
    markerSubj = AppCache.for('IMarkerSubj').set(empty);
    if (subj) return markerSubj.child = subj;
    return null;
  }


  constructor() { 
    window['_mockDataService'] = this;   // instance
    MockDataService.picsumIds = this.shuffle(JSON.parse(PICSUM_IDS));

    this._datasourceDeferred = (()=>{
      let resolve;
      let reject;
      this._ready = new Promise<any>((res, rej) => {
          resolve = res;
          reject = rej;
      });
      return { promise:this._ready, resolve, reject };
    })();
    
    return;
  }

  async init(){
    const result = await Storage.keys();
    const {resolve, reject} = this._datasourceDeferred;
    if (AppConfig.device.platform=="web" && result.keys.length==0){
      this.loadDatasources(RAW_DEMO_DATA).then( resolve, reject )
    } 
    else this._ready = this.loadDatasources().then( resolve, reject );
  }

  ready():Promise<any> {
    return this._ready;
  }

  /**
   * Storage helpers
   * to load data into storage from DevTools console
   * 
   _raw = window.MockDataService.dumpStorage()
   window._mockDataService.loadStorage(_raw)
   */
  static async dumpStorage():Promise<string> {
      const result = await Storage.keys();
      const data:any[] = [];
      
      await Promise.all(result.keys.map( async (uuid)=> {
        const resp:object = await Storage.get({key:uuid});
        const o:IRestMarker = JSON.parse(resp['value']);
        data.push(o);
      }));
      window['_raw'] = JSON.stringify(data);
      console.log( window['_raw']  );
      return Promise.resolve(window['_raw']);
  }

  async loadStorage(raw?:string):Promise<any> {
    let data = {'Photo': [], 'MarkerGroup': [], 'MarkerList': [], 'unknown':{}};
    if (!raw) {
      const result = await Storage.keys();
      if (result.keys.length==0) 
      return Promise.resolve(false);

      result.keys = result.keys.filter( k=>!k.startsWith('cache-'));
      
      await Promise.all(result.keys.map( async (uuid)=> {
        const resp:object = await Storage.get({key:uuid});
        const o:IRestMarker = JSON.parse(resp['value']);
        switch (o.className) {
          case 'Photo':
          case 'MarkerGroup':
          case 'MarkerList':
            data[o.className].push(o); break;
          default:
            data.unknown[uuid] = o; break;
        }
      }));

      return Promise.resolve(data);
    }
    // restore raw data
    await Storage.clear();
    const parsed = JSON.parse(raw);
    if (parsed instanceof Array){
      parsed.map( (o)=> {
        switch (o.className) {
          case 'Photo':
          case 'MarkerGroup':
          case 'MarkerList':
            data[o.className].push(o); break;
          default:
            data.unknown[o.uuid] = o; break;
        }
      })
    } 
    else data = parsed;
    
    // add demo Img.src 
    data.Photo.forEach((o,i)=>MockDataService.inflatePhoto(o,i,i));


    console.log("Loading data to Storage", data);
    return Promise.resolve(data);
  }



  async loadTestData(): Promise<any> {
    const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo');
    const emptyMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    const emptyMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');

    const data = {'Photo': [], 'MarkerGroup': [], 'MarkerList': [], 'unknown':{}};
    
    // load Photos
    const photos:IPhoto[] = PHOTOS.map( (o,i,l)=>{
      o = Object.assign({}, emptyPhoto, o)
      return MockDataService.inflatePhoto(o, i);
    });
    this.Photos = new RestyService(photos, "Photo");
    data['Photo'] = await this.Photos.get();

    // load MarkerGroups from Photos
    const shuffledMarkerItems = this.shuffle(data['Photo']);
    const mgs = MARKER_GROUPS.map( (o,i,l)=> {
      o = Object.assign({}, emptyMarkerGroup, o);
      return MockDataService.inflateMarkerGroup(shuffledMarkerItems, o, i);
    });
    this.MarkerGroups = new RestyService(mgs, "MarkerGroup");
    data['MarkerGroup'] = await this.MarkerGroups.get();

    // load MarkerLists from MarkerGroups
    // add some random markerLists
    const count = 1;
    const mgCount = 4;  // Math.floor(Math.random() *  4)+1;
    for (let i=0;i<count;i++ ) {
      const shuffledMarkerGroups = this.shuffle(data['MarkerGroup'], mgCount);
      const o = MockDataService.inflateMarkerListFromMarkerGroups(shuffledMarkerGroups, emptyMarkerList, i);
      data['MarkerList'].push(o);
    }
    this.MarkerLists = new RestyService(data['MarkerList'], "MarkerList");
    data['MarkerList'] = await this.MarkerLists.get();

    console.log("TESTDATA", data);
    return data;
  }

  loadDatasources(raw?:string) {
    return Promise.resolve() // return promise immediately for this.ready()
    .then ( async ()=>{
      // Storage.clear();
      let data = await this.loadStorage(raw);
      if (data){
        this.Photos = new RestyService(data.Photo, "Photo");
        this.MarkerGroups = new RestyService(data.MarkerGroup, "MarkerGroup");
        this.MarkerLists = new RestyService(data.MarkerList, "MarkerList");
      }
      else {
        const data = await this.loadTestData();
      }
      ['Photo', 'MarkerGroup', 'MarkerList'].forEach( className=>{
        data[className].forEach( async o=>{
          const allowed = RestyService.cleanProperties(o);
          await Storage.set({key: o.uuid, value: JSON.stringify(allowed)})
        });
      })
      this.sjPhotos = new SubjectiveService(this.Photos);
      this.sjMarkerGroups = new SubjectiveService(this.MarkerGroups);
      this.sjMarkerLists = new SubjectiveService(this.MarkerLists);
      return Promise.resolve(true);
    })
  }

  static inflateMarkerListFromMarkerGroups( mgs:IMarkerGroup[], o:IMarkerList, seq:number ){
    const first = mgs[0];
    const data = {
      label: `Map ${seq+1}`,
      seq: seq,
      uuid: quickUuid(),
      loc: first.loc.slice() as [number, number],
      locOffset: first.locOffset.slice() as [number, number],
      position: null,
      markerGroupIds: mgs.map(o=>o.uuid),
      count_markers: mgs.length,
    }
    data.position = MappiMarker.position(data);
    return Object.assign({},o,data);
  }

  static inflateMarkerGroup(copyOfPhotos:IPhoto[], o:IMarkerGroup, seq?:number){
    o.seq = seq;
    o.position = MappiMarker.position(o);
    // add multiple FKs, shuffled, random count
    const count = Math.min( Math.floor(Math.random() *  4)+1,  copyOfPhotos.length);
    o.markerItemIds = copyOfPhotos.splice(0,count).map( o=>o['uuid'] )
    return o;
  }
  
  static inflatePhoto(o:IPhoto, seq?:number, unused?: number){
    let baseurl = MockDataService.photo_baseurl;  //"https://picsum.photos/80?image="
    const index = MockDataService.picsumIds.shift();
    const thumbSrc = baseurl + index;
    o.seq = seq;
    o.position = MappiMarker.position(o);
    let size = MockDataService.sizes[ index % MockDataService.sizes.length];
    o.src = thumbSrc.replace("80", size.join('/'));
    o.width = size[0];
    o.height = size[1];
    o.dateTaken = o.dateTaken || new Date( Date.now() - ((90-seq)*24*3600*1000) ).toISOString();

    function patchCameraroll(o){
      o.camerarollId = "fake";
    }
    patchCameraroll(o);
    return o;
  }


  private shuffle(arr:any[], sample?:number|boolean):any[] {
    const shuffled = arr
      .map(a => [Math.random(), a])
      .sort((a, b) => a[0] - b[0])
      .map(a => a[1]);
    if (!sample) return shuffled
    if (sample===true)
      sample = Math.ceil(Math.random() * Math.floor(arr.length))
    return shuffled.slice(0,sample)
  }

}


export const MARKER_GROUPS: IMarkerGroup[] = [
  {uuid: null, label: 'Seri Hening Residence', loc: [3.1589503, 101.73743390000004], locOffset:[0,0], placeId: null, markerItemIds: [] },
  {uuid: null, label: 'Hock Choon', loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], placeId: null, markerItemIds: [] },
  {uuid: null, label: 'ISKL', loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], placeId: null, markerItemIds: [] },
  {uuid: null, label: 'Great Eastern Mall', loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], placeId: null, markerItemIds: [] },
]



export const PHOTOS: IPhoto[] = [
  {uuid: null, loc: [3.1589503, 101.73743390000004], locOffset:[0,0], dateTaken:"2018-04-23T10:49:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], dateTaken:"2018-06-03T11:49:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], dateTaken:"2018-07-23T16:29:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], dateTaken:"2018-02-23T10:11:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1589503, 101.73743390000004], locOffset:[0,0], dateTaken:"2018-04-24T10:49:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], dateTaken:"2018-06-04T11:49:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], dateTaken:"2018-07-24T16:29:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], dateTaken:"2018-02-24T10:11:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1589503, 101.73743390000004], locOffset:[0,0], dateTaken:"2018-04-25T10:49:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], dateTaken:"2018-06-05T11:49:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], dateTaken:"2018-07-25T16:29:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },
  {uuid: null, loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], dateTaken:"2018-02-25T10:11:00", orientation: 1,  src:"https://picsum.photos/80?image={id}" , width:0, height:0 },    
]


/**
 * DEV: temp class for getting user input for labels
 */
export class Prompt {
  /**
   * 
   * @param label 
   * @param key 
   * @param o 
   * @param dataService 
   */
  static async getText(label:string, key:string, o:IRestMarker, dataService:MockDataService):Promise<IMarker[]>{
    const resp =  window.prompt(`Enter ${label}:`);
    if (!resp) return;

    o[key] = resp;
    o['_rest_action'] = o['_rest_action'] || 'put'; 
    RestyTrnHelper.childComponentsChange({data:o, action:'update'}, null);  // subj is not touched with 'update
    if (!dataService) 
      return Promise.resolve([o]);

    const commitFrom = [o];
    const changed = await RestyTrnHelper.commitFromRoot(dataService, commitFrom);
    return changed;   // call subj.reload(undefined, true);
  }
}


/**
 * helpers to manage transcactions (commit/rollback) for RestyService<T>
 */


export class RestyTrnHelper {
  static objectHierarchy = {
    className : ['MarkerList', 'MarkerGroup', 'Photo'],
    schema: ['MarkerLists', 'MarkerGroups', 'Photos'],
    hasMany: ['markerGroupIds', 'markerItemIds']
  }

  static getCachedMarkers(items:IRestMarker[], option?:string):IRestMarker[] {
    
    if (option=='rollback') 
      items = items.filter( (o)=>o._rest_action!= 'post') // skip added items
    else if (option=='visible')
      items = items.filter( (o)=>o._rest_action!= 'delete') // skip removed items
    else if (option=='removed')
      items = items.filter( (o)=>o._rest_action== 'delete') // skip removed items  

    items.sort( (a,b)=>a.seq-b.seq );
    return items;
  }

  static getPlaceholder ( className:string, data:any = {} ) :any {
    const now = new Date();
    const base = {
      uuid: quickUuid(),
      loc: [0,0] as [number,number], 
      locOffset:[0,0] as [number,number],
      position: null,
      placeId: null,
      label: '',
      seq: null,
      created: now,
      modified: now,
    }
    let extras = {}
    switch (className){
      case 'Photo': // MarkerItem
        extras = {
          className: 'Photo',
          dateTaken: null,
          orientation: 1,
          src: null,
          width: null,
          height: null,
          camerarollId: null,   
        }
        break;
      case 'MarkerGroup':
        extras = {
          className: 'MarkerGroup',
          label: null,
          markerItemIds:[],
        }
        break;
      case 'MarkerList':
        extras = {
          className: 'MarkerList',
          label: null,
          markerGroupIds:[],
          zoom: null,
          count_markers: 0,
          count_items: 0,
        }
        break;
    }
    const {uuid, created, modified} = base;  // force new values
    Object.assign(base, extras, data, {uuid, created, modified});
    if (!base.position && MappiMarker.hasLoc(base)) 
      base.position = MappiMarker.position(base);
    
    switch (className){
      case 'Photo': return base as any as IPhoto
      case 'MarkerGroup': return base as any as IMarkerGroup
      case 'MarkerList': return base as any as IMarkerList
      default: return base as any
    }
  }

  static setFKfromChild (parent:any, child:IRestMarker) {
    const hasMany_Keys = RestyTrnHelper.objectHierarchy.hasMany;
    const found = Object.keys(parent).filter( k=>hasMany_Keys.includes(k))
    if (!found) throw new Error("ERROR: Expecting parent instanceof IMarkerList or IMarkerGroup");

    const key = found[0];
    parent._commit_child_items = parent._commit_child_items || [];
    if (parent[key] instanceof Array) {
      if (parent[key].includes(child.uuid)==false){
        parent[key].push(child.uuid);
        parent._commit_child_items.push(child);
      }
      // else duplicate
    }
    else {
      parent[key] = [child.uuid];
      parent._commit_child_items.push(child);
    }
    child['_rest_action'] = 'post';
    // NOTE: call .inflateUncommittedMarker() to render uncommitted data
    return;
  }
  static setLocFromChild (data:any, child:IRestMarker) {
    if (!MappiMarker.hasLoc(child))
      return;
    const {loc, locOffset, position, placeId} = child;
    Object.assign(data, {loc, locOffset, position, placeId});
  }
  static setLocToDefault (data:IRestMarker, defaultPosition:{lat:number, lng: number} | google.maps.LatLng) {
    if (defaultPosition instanceof google.maps.LatLng)
      defaultPosition = defaultPosition.toJSON();
    const options = {
      loc: [defaultPosition.lat, defaultPosition.lng],
      locOffset: [0,0],
      position: defaultPosition,
      placeId: null,
      _loc_was_map_center: true,
    }
    Object.assign(data, options);
  }


  static childComponentsChange( change: {data:IRestMarker, action:string}, subj: SubjectiveService<IMarker>){
    if (!change.data) return;
    const markers = subj.value();
    const marker = change.data;
    switch(change.action){
      // case 'selected':
      //   this._selectedMarkerGroup = mg.uuid;
      //   break;
      case 'add':
        // update ChildComponent subject, which is referenced by ParentComponent
        const newMarker = change.data;
        newMarker['_rest_action'] = 'post';
        const items = this.getCachedMarkers(markers); // just sort
        items.push(newMarker);
        subj.next(items);
        return;   
      case 'update':
        marker['_rest_action'] = marker['_rest_action'] || 'put';
        return;    
      case 'move':
        /**
         * NOTE:  use action='move' for manual re-index => _rest_action='put'
         *  - use _rest_action='seq' for auto re-indexing on commit
         *  */ 
        marker['_rest_action'] = marker['_rest_action'] || 'put';
        return;
      case 'remove':
        marker['_rest_action'] = 'delete';
        subj.next(this.getCachedMarkers(markers));
        return;
    }
  }

  /**
   * 
   * Recursive commit of IRestMarker[], beginning from leafs
   * 
   * @param dataSvc 
   * @param commitFrom IRestMarker[] items to begin recursive commit
   * @returns IMarker[], // TODO: need to call subj.reload( undefined , true) on success
   */
  static async commitFromRoot(
    dataSvc?:MockDataService, 
    commitFrom?: IRestMarker[],
  ):Promise<IMarker[]> {
    const items = commitFrom;             //  subj.value();
    // action="commit"
    const commitItems = items.filter(o=>o._rest_action);
    const remainingItems = RestyTrnHelper.getCachedMarkers(items, 'visible')
    .sort( (a,b)=>a.seq-b.seq )
    .map((o,i)=>{
      o.seq = i;    // re-index remaining/visible items
      if (!o._rest_action) o._rest_action = 'seq';
      return o;
    });
    const allItems = remainingItems.concat(RestyTrnHelper.getCachedMarkers(items, 'removed'));

    const check = commitItems.filter( o=>!allItems.includes(o));
    if (check.length)
      console.error("applyChanges(): some commitItems were NOT included", check);

    return RestyTrnHelper._childComponents_CommitChanges(allItems, dataSvc)
    .then( 
      (changed:IMarker[])=>{
        // need to reload changed markers. WHERE/WHEN??
        return changed;
      }
      , err=>{
        console.error(`ERROR: problem saving nodes.`, allItems);
        return Promise.reject(err);
    });
  }

  /**
   * commit changes to Resty and reload Subject to push changes to Observers
   * - recursively commit child items before parent
   * - SubjectiveService.reload( items, resort='false') after each leaf node complete
   * @param changes 
   * @param dataSvc 
   */
  private static async _childComponents_CommitChanges(
    changes:IRestMarker[],  
    dataSvc?:MockDataService,
    isRecursive:boolean=false,
  ):Promise<IMarker[]>{  
    const generations = ['MarkerLists', 'MarkerGroups', 'Photos'];
    const pr:Promise<any>[] = [];

    changes.forEach( async (o)=>{
      // lookup REST table
      const restyNameIndex = generations.findIndex(v=>v.startsWith(o.className));
      const resty:RestyService<IMarker> = dataSvc[generations[restyNameIndex]];

      // first, recursively commit child

      if (o.hasOwnProperty('_commit_child_items')){
        const items = o['_commit_child_items'];
        const childSubj = MockDataService.getSubjByParentUuid(o.uuid);   // deprecate
        // recursive call
        pr.push( RestyTrnHelper._childComponents_CommitChanges(items, dataSvc, isRecursive=true)
          .then (
            res=>{
              delete o['_commit_child_items'];
              return res;
            }
            ,(err)=>{
            console.error(`Error saving child element ${o.className}`, err, o);
            return Promise.reject(err);
          }));
        // then continue below
      }

      switch(o._rest_action) {
        case "post":
          pr.push( resty.post(o).then( 
            o=>{delete o['_rest_action']; return o;}
            , err=>{
              if (err=="ERROR: duplicate uuid") return Promise.resolve(o);
              return Promise.reject(err);
            }) );     
          break;
        case "put":
          pr.push( resty.put(o.uuid, o).then( o=>{delete o['_rest_action']; return o;}) );     
          break;
        case "seq":
          console.warn("confirm _rest_action=seq is working properly");
          // do not report sequence updates
          resty.put(o.uuid, o, ['seq']).then( o=>{delete o['_rest_action'];})    
          break;
        case "delete":
          pr.push( resty.delete(o.uuid).then( resp=>{
            if (!resp && !o.uuid){
              return false;   // otherwise, item was not in DB
            }
            delete o['_rest_action']; 
            return true;
          }) );     
          break;
      }
    });

    return Promise.all(pr)
    .then( 
      (res)=>{
        let changed = [];
        res.forEach( o=>{
          if (o instanceof Array) 
            changed = changed.concat(o);
          else changed.push(o);
        });
        // const rootChange = changed[changed.length-1];
        // console.warn( "> RestyTrnHelper COMMIT, className=", rootChange.className, changes.filter(o=>o.className==rootChange.className) )
        return changed as IMarker[];
      }
      ,(err)=>{
        console.error(err);
        return Promise.reject(err);
      } )
  } 


 
}