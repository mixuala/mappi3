import { Injectable } from '@angular/core';
import { quickUuid as _quickUuid, RestyService } from './resty.service';
import { SubjectiveService } from './subjective.service';
import { Observable, BehaviorSubject } from 'rxjs';

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
}

export interface IMarkerGroup extends IMarker {
  label?: string,  
  placeId?: string,
  // MarkerGroup hasMany MarkerItems, use Photos for now.
  markerItemIds: string[],  // uuid[]
  [propName: string]: any;
}

// export interface IMarkerItem {
//   id: number,
//   type: string,
// }

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
    this._ready = Promise.resolve()
    .then (()=>{
      this.Photos = new RestyService(PHOTOS, "Photo");
      this.MarkerGroups = new RestyService(MARKER_GROUPS, "MarkerGroup");
  
      // clean photos data
      PHOTOS.forEach( (o,i,l)=>{ 
        MockDataService.inflatePhoto(o, i);
      });
      this.Photos = new RestyService(PHOTOS, "Photo");

      // clean marker data
      return this.Photos.get()
    })
    .then( photos=>{
      const shuffledMarkerItems = this.shuffle(photos);
      MARKER_GROUPS.forEach( (o,i,l)=> {
        MockDataService.inflateMarkerGroup(shuffledMarkerItems, o, i);
      });
      const check = MARKER_GROUPS;
      this.MarkerGroups = new RestyService(MARKER_GROUPS, "MarkerGroup");
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
      const count = 4;
      for (let i of Array(count)) {
        const mgCount = Math.floor(Math.random() *  4)+1;
        const shuffledMarkerGroups = this.shuffle(mgs, mgCount);
        const markerList = MockDataService.createMarkerList(shuffledMarkerGroups);
        console.log(`uuid:${markerList.uuid}, markerGroups=` , shuffledMarkerGroups)
        MockDataService.MARKER_LISTS.push(markerList);
      }
        
      this.MarkerLists = new RestyService(MockDataService.MARKER_LISTS, "MarkerList");
      this.sjMarkerLists = new SubjectiveService(this.MarkerLists);
    });    
  }

  ready():Promise<void> {
    return this._ready;
  }

  static createMarkerList( mgs:IMarkerGroup[]){
    const first = mgs[0];
    const seq = MockDataService.MARKER_LISTS.length;
    const markerList = {
      label: `marker list ${seq}`,
      uuid: quickUuid(),
      loc: first.loc.slice(),
      locOffset: first.locOffset.slice(),
      position: Object.assign({},first.position),
      markerGroupIds: mgs.map(o=>o.uuid),
      count_markers: mgs.length,
    }
    return markerList;
  }

  static inflateMarkerGroup(copyOfPhotos:IPhoto[], o:IMarkerGroup, seq?:number){
    o.seq = seq;
    o.position = {
      lat: o.loc[0] + o.locOffset[0],
      lng: o.loc[1] + o.locOffset[1],
    }
    // add multiple FKs, shuffled, random count
    const count = Math.min( Math.floor(Math.random() *  4)+1,  copyOfPhotos.length);
    o.markerItemIds = copyOfPhotos.splice(0,count).map( o=>o['uuid'] )
    return o;
  }

  static inflatePhoto(o:IPhoto, seq?:number){
    const random = Math.min( Math.floor(Math.random() *  99))
    o.seq = seq;
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

