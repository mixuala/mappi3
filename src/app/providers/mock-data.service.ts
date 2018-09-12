import { Injectable } from '@angular/core';

export interface INumOrReturn {

}

export interface IMarkerGroup {
  id: number,
  loc: [number,number],
  locOffset: [number,number],
  seq?: number,
  label?: string,  
  placeId?: string,
  // MarkerGroup hasMany MarkerItems, use Photos for now.
  markerItemIds?: number[],
  markerItems?: IPhoto[],
  // derived value: loc + locOffset
  position?: {    //new google.maps.LatLng(position);
    lat: number,
    lng: number,
  },
}

// export interface IMarkerItem {
//   id: number,
//   type: string,
// }

export interface IPhoto {
  id: number,
  loc: [number,number],
  dateTaken: string,
  orientation: number,
  src: string,
  seq?:number,
  thumbnail?: string,
  width?: number,
  height?: number,
}



@Injectable({
  providedIn: 'root'
})
export class MockDataService {


  public sizes:any[] = [[640,480],[480,640], [960,640], [640,960]];


  constructor() { 
    // clean photos data
    
    PHOTOS.forEach( (o,i,l)=>{ 
      o.id = i;
      o = this.inflatePhoto(o);
    });

    // clean marker data
    const shuffledMarkerItems = this.shuffle(PHOTOS);
    MARKER_GROUPS.forEach( (o,i,l)=> {
      o.id = i;
      o.seq = i;
      o.position = {
        lat: o.loc[0] + o.locOffset[0],
        lng: o.loc[1] + o.locOffset[1],
      }
      // add FKs
      o.markerItemIds = [i];

      // add multiple FKs, shuffled, random count
      const count = Math.min( Math.floor(Math.random() *  3)+1,  shuffledMarkerItems.length);
      o.markerItemIds = shuffledMarkerItems.splice(0,count).map( o=>o.id )
    });
    
  }

  inflatePhoto(o:IPhoto, seq?:number){
    o.seq = seq || o.id;
    o.src = o.src.replace("{id}", `${o.id}`)
    o.thumbnail = o.src.trim()
    let size = this.sizes[Math.floor(Math.random() * this.sizes.length)]
    o.src = o.src.replace("80", size.join('/'))
    o.width = size[0];
    o.height = size[1];
    return o;
  }

  getMarkers(ids?:number[]) : Promise<IMarkerGroup[]> {
    let promise : Promise<IMarkerGroup[]> = new Promise((resolve, reject) => {
      resolve(MARKER_GROUPS);
    });
    return promise;
  }

  getPhotos(ids?:number[]) : Promise<IPhoto[]> {
    let promise : Promise<IPhoto[]>   = new Promise((resolve, reject) => {
      const result = ids ? PHOTOS.filter( p=>ids.includes(p.id) ) : PHOTOS;
      resolve(result);
    });
    return promise;
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
  {id: 0, label: 'Seri Hening Residence', loc: [3.1589503, 101.73743390000004], locOffset:[0,0], placeId: null, markerItemIds: [] },
  {id: 0, label: 'Hock Choon', loc: [3.160250353353649, 101.72868381210333], locOffset:[0,0], placeId: null, markerItemIds: [] },
  {id: 0, label: 'ISKL', loc: [3.1569080416737467, 101.74091468521124], locOffset:[0,0], placeId: null, markerItemIds: [] },
  {id: 0, label: 'Great Eastern Mall', loc:  [3.1602273283815983, 101.73691749572754], locOffset:[0,0], placeId: null, markerItemIds: [] },
]


export const PHOTOS: IPhoto[] = [
  {id: 0, loc: [3.1589503, 101.73743390000004], dateTaken:"2018-04-23T10:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.160250353353649, 101.72868381210333], dateTaken:"2018-06-03T11:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.1569080416737467, 101.74091468521124], dateTaken:"2018-07-23T16:29:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc:  [3.1602273283815983, 101.73691749572754], dateTaken:"2018-02-23T10:11:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.1589503, 101.73743390000004], dateTaken:"2018-04-24T10:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.160250353353649, 101.72868381210333], dateTaken:"2018-06-04T11:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.1569080416737467, 101.74091468521124], dateTaken:"2018-07-24T16:29:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc:  [3.1602273283815983, 101.73691749572754], dateTaken:"2018-02-24T10:11:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.1589503, 101.73743390000004], dateTaken:"2018-04-25T10:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.160250353353649, 101.72868381210333], dateTaken:"2018-06-05T11:49:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc: [3.1569080416737467, 101.74091468521124], dateTaken:"2018-07-25T16:29:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },
  {id: 0, loc:  [3.1602273283815983, 101.73691749572754], dateTaken:"2018-02-25T10:11:00", orientation: 1,  src:"https://picsum.photos/80?random={id}" , width:0, height:0 },    
]


 
