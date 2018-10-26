import { Injectable } from '@angular/core';
import { Plugins } from '@capacitor/core';
import { Observable, ReplaySubject } from 'rxjs';

import { quickUuid as _quickUuid, RestyService } from './resty.service';
import { SubjectiveService } from './subjective.service';
import { MappiMarker, } from '../providers/mappi/mappi.service';
import { IExifPhoto, IThumbSrc } from './photo/photo.service';

const { Storage } = Plugins;

export function quickUuid() {
  // re-export
  return _quickUuid();
};

export interface IMarker {
  uuid: string,
  loc: [number,number],
  locOffset: [number,number], 
  position?: {    //new google.maps.LatLng(position);
    lat: number,
    lng: number,
  },
  seq?: number,
  placeId?: string,
}


export interface IRestMarker extends IMarker {
  className?: string;
  _rest_action?: string;
  _commit_child_items?: IMarker[];
  _loc_was_map_center?: boolean;
  _detectChanges?:boolean;
}

export interface IMarkerGroup extends IMarker {
  label?: string,  
  // MarkerGroup hasMany MarkerItems, use Photos for now.
  markerItemIds: string[],  // uuid[]
  [propName: string]: any;
}

export interface IPhoto extends IMarker {
  dateTaken: string,
  orientation: number,
  src: string,
  width?: number,
  height?: number,
  camerarollId?: string,          // LibraryItem.id
  // extras
  _imgCache?: {[dim:string]: string},
  _thumbSrc?: IThumbSrc,
  _thumbSrc$?: Observable<IThumbSrc>,
  _subj?: ReplaySubject<IThumbSrc>,
  [propName: string]: any;
}


export interface IMarkerList extends IMarker {
  label: string;
  zoom?: number;
  markerGroupIds: string[];
  count_markers?: number;
  count_items?: number;
  created?: Date;
  modified?: Date;
}



@Injectable({
  providedIn: 'root'
})
export class MockDataService {

  // random sample of image sizes for placeholder photos
  static sizes:any[] = [[640,480],[480,640], [960,640], [640,960]];
  static photo_baseurl: string = "https://picsum.photos/80?image=";

  public MarkerLists:RestyService<IMarkerList>;
  public MarkerGroups:RestyService<IMarkerGroup>;
  public Photos:RestyService<IPhoto>;

  public sjMarkerLists:SubjectiveService<IMarkerList>;
  public sjMarkerGroups:SubjectiveService<IMarkerGroup>;
  public sjPhotos:SubjectiveService<IPhoto>;

  private _ready:Promise<any>;
  private static MARKER_LISTS = [];

  /**
   * helper functions
   */
  // local cache of SubjectiveService<IMarker>
  public static subjectCache: {
    [uuid: string]:{
      self:SubjectiveService<IMarker>, 
      child:SubjectiveService<IMarker>
    }
  } = {};
  static getSubjByUuid(uuid:string, subj?:SubjectiveService<IMarker>){
    MockDataService.subjectCache[uuid] = MockDataService.subjectCache[uuid] || {self: null, child:null};
    if (subj)
      MockDataService.subjectCache[uuid].self = subj;   
    return MockDataService.subjectCache[uuid].self || null;
  }
  static getSubjByParentUuid(uuid:string, subj?:SubjectiveService<IMarker>){
    MockDataService.subjectCache[uuid] = MockDataService.subjectCache[uuid] || {self: null, child:null};
    if (subj){
      MockDataService.subjectCache[uuid].child = subj;
    }   
    return MockDataService.subjectCache[uuid].child || null;
  }


  constructor() { 
    this._ready = this.loadDatasources()
    .then( ()=>console.log("TESTDATA READY"));
    window['_mockDataService'] = this;
    window['_MockDataService'] = MockDataService;
    window['_SubjectiveService'] = SubjectiveService;

    return;
  }

  ready():Promise<any> {
    return this._ready;
  }

  /**
   * Storage helpers
   * to load data into storage from DevTools console
   * 
   window._mockDataService.dumpStorage()
   _raw
   window._mockDataService.loadStorage(_raw)
   */
  async dumpStorage() {
      const result = await Storage.keys();
      const data:any[] = [];
      
      await Promise.all(result.keys.map( async (uuid)=> {
        const resp:object = await Storage.get({key:uuid});
        const o:IRestMarker = JSON.parse(resp['value']);
        data.push(o);
      }));
      window['_raw'] = JSON.stringify(data);
      console.log( window['_raw']  );
      // call _mockDataService.
  }

  async loadStorage(raw?:string):Promise<any> {
    let data = {'Photo': [], 'MarkerGroup': [], 'MarkerList': [], 'unknown':{}};
    if (!raw) {
      const result = await Storage.keys();
      if (result.keys.length==0) 
      return Promise.resolve(false);
      
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
        const testdata = await this.loadTestData();
        ['Photo', 'MarkerGroup', 'MarkerList'].forEach( className=>{
          testdata[className].forEach( async o=>{
            const allowed = RestyService.cleanProperties(o);
            await Storage.set({key: o.uuid, value: JSON.stringify(allowed)})
          });
        })
      }
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

  static inflatePhoto(o:IPhoto, seq?:number){
    const random = Math.min( Math.floor(Math.random() *  99))
    const thumbSrc = MockDataService.photo_baseurl + random;
    o.seq = seq;
    o.position = MappiMarker.position(o);
    o._imgCache = {
      // demo data only, inflate o._thumbSrc in MarkerItemComponent
      '80x80': thumbSrc
    };
    let size = MockDataService.sizes[ random % MockDataService.sizes.length];
    o.src = thumbSrc.replace("80", size.join('/'));
    o.width = size[0];
    o.height = size[1];

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
          _thumbSrc: {},    // do NOT save to Resty
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
    switch (found[0]) {
      case 'markerItemIds': parent['markerItemIds'] = [child.uuid]; break;
      case 'markerGroupIds': parent['markerGroupIds'] = [child.uuid]; break;
    }
    parent._commit_child_items = parent._commit_child_items || [];
    parent._commit_child_items.push(child);
    const childSubj = MockDataService.getSubjByParentUuid(parent.uuid);

    child['_rest_action'] = 'post';
    // BUG: somehow calling childSubj.next([child]) stops code execution;
    // RestyTrnHelper.childComponentsChange({data:child, action:'add'}, childSubj);
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
        const newMarker = change.data;
        newMarker['_rest_action'] = 'post';
        const items = this.getCachedMarkers(markers); // just sort
        items.push(newMarker);
        subj.next(items);
        return;
      case 'update_marker':

        console.warn("What does update_marker do here?");
        // ???:update markerGroup.position from markerItem.position, DEPRECATE?

        // // update google.map.Marker position directly
        // const m = MappiMarker.findByUuid([marker.uuid]).shift();
        // m.setPosition(marker.position);


        subj.next(this.getCachedMarkers(markers));
        return;   
      case 'update':
        marker['_rest_action'] = marker['_rest_action'] || 'put';
        return;    
      case 'move':
        marker['_rest_action'] = marker['_rest_action'] || 'put';
        return;
      case 'remove':
        marker['_rest_action'] = 'delete';
        subj.next(this.getCachedMarkers(markers));
        return;
    }
  }

  static async applyChanges(
    action:string, 
    subj: SubjectiveService<IRestMarker>, 
    dataSvc?:MockDataService, 
  ):Promise<IMarker[]> {
    const items = subj.value();
    const changed:IMarker[]=[];
    switch(action){
      case "commit":
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

        const res = await RestyTrnHelper._childComponents_CommitChanges(allItems, subj, dataSvc)
        .catch( err=>{
          console.error(`ERROR: problem saving '${subj.className}' nodes.`, allItems);
          return Promise.reject(err);
        })
        subj.reload( remainingItems.map(o=>o.uuid) );
        console.warn( "> RestyTrn.applyChanges, reload from", subj.className )
        return changed.concat(res);

      case "rollback":
        // TODO: need to rollback recursively
        const uuids = RestyTrnHelper.getCachedMarkers(items, 'rollback')
        .map( o=>o.uuid );
        return subj.reload( uuids );
    }
  }

  private static _schemaLookup(subj:SubjectiveService<any>, dataSvc:MockDataService, generation?:string):RestyService<IMarker>{
    let found = RestyTrnHelper.objectHierarchy.className.findIndex( v=>v==subj.className)
    try {
      if (found==-1) throw new Error('className not found');

      switch (generation){
        case 'parent': found--; break;
        case 'child': found++; break;
      }
      return dataSvc[ RestyTrnHelper.objectHierarchy.schema[found] ];
    } catch (err) {
      console.log(`ERROR lookup db schema from className`, err);
    }
  }

  private static async _childComponents_CommitChanges(
    changes:IRestMarker[], 
    subj: SubjectiveService<IMarker>, 
    dataSvc:MockDataService,
    
  ):Promise<IMarker[]>{  
    const resty:RestyService<IMarker> = RestyTrnHelper._schemaLookup(subj, dataSvc);
    const pr:Promise<any>[] = [];
    changes.forEach( async (o)=>{
      // recursively commit child
      const restyChild:RestyService<IMarker> = RestyTrnHelper._schemaLookup(subj, dataSvc, 'child');
      if (o.hasOwnProperty('_commit_child_items')){
        const items = o['_commit_child_items'];
        const childSubj = MockDataService.getSubjByParentUuid(o.uuid);
        // recursive call
        pr.push( RestyTrnHelper._childComponents_CommitChanges(items, childSubj, dataSvc)
          .then (
            res=>{
              delete o['_commit_child_items'];
              return res;
            }
            ,(err)=>{
            console.error(`Error saving child element: ${restyChild.className} of ${subj.className}`, err);
            return Promise.reject(err);
          }));
        // then continue below
      }

      switch(o._rest_action) {
        case "post":
          pr.push( resty.post(o).then( o=>{delete o['_rest_action']; return o;}) );     
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
          pr.push( resty.delete(o.uuid).then( o=>{delete o['_rest_action']; return o;}) );     
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
        })
        return changed as IMarker[];
      }
      ,(err)=>{
        console.error(err);
        return Promise.reject(err);
      } )
  } 


 
}