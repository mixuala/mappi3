import { Injectable } from '@angular/core';
import { quickUuid as _quickUuid, RestyService } from './resty.service';
import { SubjectiveService } from './subjective.service';
import { Observable, BehaviorSubject } from 'rxjs';

import { MappiMarker, MappiService, } from '../providers/mappi/mappi.service';

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
  _rest_action?: string;
  _commit_child_item?: IMarker;
  _loc_was_map_center?: boolean;
}

export interface IMarkerGroup extends IMarker {
  label?: string,  
  // MarkerGroup hasMany MarkerItems, use Photos for now.
  markerItemIds: string[],  // uuid[]
  [propName: string]: any;
}

export interface IPhoto  extends IMarker {
  dateTaken: string,
  orientation: number,
  src: string,
  thumbnail?: string,
  width?: number,
  height?: number,
  image?: {
    width:number,
    height:number,
  }
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

  private _ready:Promise<void>;
  private static MARKER_LISTS = [];

  /**
   * helper functions
   */
  // local cache of SubjectiveService<IMarker>
  public static subjectCache: {[uuid: string]:SubjectiveService<IMarker>} = {};
  static getSubjByParentUuid(uuid:string, subj?:SubjectiveService<IMarker>){
    if (subj)
      MockDataService.subjectCache[uuid] = subj;   
    return MockDataService.subjectCache[uuid] || null;
  }

  

  constructor() { 
    const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo');
    const emptyMarkerGroup = RestyTrnHelper.getPlaceholder('MarkerGroup');
    const emptyMarkerList = RestyTrnHelper.getPlaceholder('MarkerList');

    this._ready = Promise.resolve()
    .then (()=>{
      this.Photos = new RestyService(PHOTOS, "Photo");
      this.MarkerGroups = new RestyService(MARKER_GROUPS, "MarkerGroup");
  
      // clean photos data
      const photos:IPhoto[] = PHOTOS.map( (o,i,l)=>{
        o = Object.assign({}, emptyPhoto, o)
        return MockDataService.inflatePhoto(o, i);
      });
      this.Photos = new RestyService(photos, "Photo");

      // clean marker data
      return this.Photos.get()
    })
    .then( photos=>{
      const shuffledMarkerItems = this.shuffle(photos);
      const mgs = MARKER_GROUPS.map( (o,i,l)=> {
        o = Object.assign({}, emptyMarkerGroup, o);
        return MockDataService.inflateMarkerGroup(shuffledMarkerItems, o, i);
      });
      this.MarkerGroups = new RestyService(mgs, "MarkerGroup");
    })
    .then (()=>{
      this.sjPhotos = new SubjectiveService(this.Photos);
      this.sjMarkerGroups = new SubjectiveService(this.MarkerGroups);
    })
    .then (()=>{
      // return this.sjMarkerGroups.get$().toPromise()
      return this.MarkerGroups.get()
    })
    .then ((mgs)=>{
      // add some random markerLists
      const count = 1;
      const mgCount = 4;  // Math.floor(Math.random() *  4)+1;
      for (let i of Array(count)) {
        const shuffledMarkerGroups = this.shuffle(mgs, mgCount);
        const o = MockDataService.inflateMarkerListFromMarkerGroups(shuffledMarkerGroups, emptyMarkerList, i);
        console.log(`uuid:${o.uuid}, markerGroups=` , shuffledMarkerGroups)
        MockDataService.MARKER_LISTS.push(o);
      }
        
      this.MarkerLists = new RestyService(MockDataService.MARKER_LISTS, "MarkerList");
      this.sjMarkerLists = new SubjectiveService(this.MarkerLists);
    });    
  }

  ready():Promise<void> {
    return this._ready;
  }

  static inflateMarkerListFromMarkerGroups( mgs:IMarkerGroup[], o:IMarkerList, seq?:number ){
    const first = mgs[0];
    seq = seq || MockDataService.MARKER_LISTS.length;
    const data = {
      label: `marker list ${seq}`,
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
    o.seq = seq;
    o.position = MappiMarker.position(o);
    o.src = MockDataService.photo_baseurl + random;
    o.thumbnail = o.src.trim();
    let size = MockDataService.sizes[ random % MockDataService.sizes.length];
    o.src = o.src.replace("80", size.join('/'));
    o.width = size[0];
    o.height = size[1];
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

  static getPlaceholder ( className:string, data:any = {} ) {
    const now = new Date();
    const base = {
      uuid: quickUuid(),
      loc: [0,0], 
      locOffset:[0,0], 
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
          thumbnail: null,
          width: null,
          height: null,
          image: {
            width:null,
            height:null,
          }
        }
        break;
      case 'MarkerGroup':
        extras = {
          className: 'MarkerGroup',
          markerItemIds:[],
        }
        break;
      case 'MarkerList':
        extras = {
          className: 'MarkerList',
          markerGroupIds:[],
          zoom: null,
          count_markers: 0,
          count_items: 0,
        }
        break;
    }
    return Object.assign(base, extras, data);
  }

  static setFKfromChild (data:any, child:IRestMarker) {
    const hasMany_Keys = RestyTrnHelper.objectHierarchy.hasMany;
    const found = Object.keys(data).filter( k=>hasMany_Keys.includes(k))
    switch (found[0]) {
      case 'markerItemIds': data['markerItemIds'] = [child.uuid]; break;
      case 'markerGroupIds': data['markerGroupIds'] = [child.uuid]; break;
    }
    data._commit_child_item = child;
    child._rest_action = 'post';
  }
  static setLocFromChild (data:any, child:IRestMarker) {
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
        const items = this.getCachedMarkers(markers);
        items.push(newMarker);
        subj.next(items);
        return;
      case 'update_marker':

        // update google.map.Marker position directly
        const m = MappiMarker.findByUuid([marker.uuid]).shift();
        m.setPosition(marker.position);


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

  static applyChanges(action:string, subj: SubjectiveService<IMarker>, dataSvc:MockDataService):Promise<IMarker[]> {
    return Promise.resolve(true)
    .then( res=>{
      const items = subj.value();
      switch(action){
        case "commit":
          const remainingItems = RestyTrnHelper.getCachedMarkers(items, 'visible')
          .sort( (a,b)=>a.seq-b.seq )
          .map((o,i)=>{
            o.seq = i;    // re-index remaining/visible items
            if (!o._rest_action) o._rest_action = 'seq';
            return o;
          });
          const allItems = remainingItems.concat(RestyTrnHelper.getCachedMarkers(items, 'removed'))
          return RestyTrnHelper._childComponents_CommitChanges(allItems, subj, dataSvc)
          .catch( err=>{
            console.error(`ERROR: problem saving '${subj.className}' nodes.`, allItems);
            Promise.reject(err);
          })
          .then( res=>{
            return subj.reload( remainingItems.map(o=>o.uuid) );
          })
        case "rollback":
          const uuids = RestyTrnHelper.getCachedMarkers(items, 'rollback')
          .map( o=>o.uuid );
          return subj.reload( uuids );
      }
    })
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

  private static 
  _childComponents_CommitChanges(changes:IRestMarker[], subj: SubjectiveService<IMarker>, dataSvc:MockDataService):Promise<any>{  
    const resty:RestyService<IMarker> = RestyTrnHelper._schemaLookup(subj, dataSvc);
    const done:Promise<IRestMarker|boolean>[] = changes.map( o=>{
      const restAction = o._rest_action;
      delete o._rest_action;
      switch(restAction) {
        case "post":
          const restyChild:RestyService<IMarker> = RestyTrnHelper._schemaLookup(subj, dataSvc, 'child');
          return Promise.resolve()
          .then( ()=>{
            if (o.hasOwnProperty('_commit_child_item')){
              // console.warn( " >>>> commit child of" , o);
              // recursively commit child
              const child = o['_commit_child_item'];
              const childSubj = MockDataService.getSubjByParentUuid(o.uuid)
              return RestyTrnHelper._childComponents_CommitChanges([child], childSubj, dataSvc);
              // return restyChild.post( o['_commit_child_item'] );
            }
            return o;
          })
          .then( 
            (res)=>delete o['_commit_child_item']
            ,(err)=>console.error(`Error saving child element: ${restyChild.className} of ${subj.className}`)  
          )
          .then( ()=>{
            return resty.post(o);
          })
        case "put":
          return resty.put(o.uuid, o);
        case "seq":
          // return true;
          return resty.put(o.uuid, o, ['seq']);  
        case "delete":
          return resty.delete(o.uuid)
      }
    });
    return Promise.all(done);
  }


 
}