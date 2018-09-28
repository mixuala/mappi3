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



@Injectable({
  providedIn: 'root'
})
export class MockDataService {

  // random sample of image sizes for placeholder photos
  static sizes:any[] = [[640,480],[480,640], [960,640], [640,960]];

  public MarkerGroups:RestyService<IMarkerGroup>;
  public Photos:RestyService<IPhoto>;

  public sjMarkerGroups:SubjectiveService<IMarkerGroup>;
  public sjPhotos:SubjectiveService<IPhoto>;

  // local cache of map BehaviorSubjects
  public markerCollSubjectDict: {[uuid: string]:SubjectiveService<IMarker>} = {};

  private _ready:Promise<void>;

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
    });    
  }

  ready():Promise<void> {
    return this._ready;
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
    try {
      o.src = o.src.replace("{id}", `${o.seq}`)
    } catch {
      o.src = `https://picsum.photos/80?random=${o.seq || random}`;
    }
    o.thumbnail = o.src.trim()
    let size = MockDataService.sizes[Math.floor(Math.random() * MockDataService.sizes.length)]
    o.src = o.src.replace("80", size.join('/'))
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
  {uuid: null, loc: [3.1589503, 101.73743390000004], locOffset:[0,0], dateTaken:"2018-04-23T10:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], dateTaken:"2018-06-03T11:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], dateTaken:"2018-07-23T16:29:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], dateTaken:"2018-02-23T10:11:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1589503, 101.73743390000004], locOffset:[0,0], dateTaken:"2018-04-24T10:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], dateTaken:"2018-06-04T11:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], dateTaken:"2018-07-24T16:29:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], dateTaken:"2018-02-24T10:11:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1589503, 101.73743390000004], locOffset:[0,0], dateTaken:"2018-04-25T10:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], dateTaken:"2018-06-05T11:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], dateTaken:"2018-07-25T16:29:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {uuid: null, loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], dateTaken:"2018-02-25T10:11:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },    
]

