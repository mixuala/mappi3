/***
 * typescript interfaces 
 */


export interface IMarker {
  className?: string;
  uuid: string,
  loc: [number,number],
  locOffset: [number,number], 
  position?: {    //new google.maps.LatLng(position);
    lat: number,
    lng: number,
  },
  seq?: number,
  placeId?: string,
  markerLinkIds?: string[];
  created?: Date;
  modified?: Date;
}

// ???: extend IMarker or IPhoto
// from fb open graph
export interface IMarkerLink extends IMarker {
  title: string;
  description: string;
  url: string;
  image: string;
  published?: string;     // ISODate
  site_name?: string;
  author?: string;
  tag?: string;
  width?: number;
  height?: number;
  _imgSrc$?: Observable<IImgSrc>;
}


export interface IRestMarker extends IMarker {
  _rest_action?: string;
  _commit_child_items?: IMarker[];
  _loc_was_map_center?: boolean;
  _detectChanges?:boolean;
}

export interface IMarkerGroup extends IMarker {
  label?: string;
  description?: string;
  // MarkerGroup hasMany MarkerItems, use Photos for now.
  markerItemIds: string[];  // uuid[]
  [propName: string]: any;
}

export interface IPhoto extends IMarker {
  dateTaken: string,  // Date.toISOString()
  orientation: number,
  src: string,
  width?: number,
  height?: number,
  label?: string
  camerarollId?: string,          // LibraryItem.id
  _imgSrc$?: Observable<IImgSrc>;
}

export interface IMarkerList extends IMarker {
  label: string;
  description?: string;
  zoom?: number;
  markerGroupIds: string[];
  count_markers?: number;
  count_items?: number;
}

export interface IFavorite {
  uuid: string;
  className: string;
  favorite: boolean;
  created?: Date;
  modified?: Date;
}


/**********************************************************************************************
 * google map types
 **********************************************************************************************/
export interface IUuidMarker extends google.maps.Marker {
  uuid: string;
  [propName: string]: any;
}

// DB record which maps to a marker
export interface IMappiMarker extends IMarker {
  label?: string;
  // use for GoogleMapsComponent
  _marker?: IUuidMarker;
  listeners?: any  // move to marker._listeners;
  [propName: string]: any;
}

export interface IMapActions {
  dragend?: boolean;  //  ((m:IMarker)=>void);
  click?:  boolean;  //  ((m:IMarker)=>void);
  dblclick?:  boolean;  //  ((m:IMarker)=>void);
  [propName: string]: any;
}

export type IPoint = [number, number] | {lat:number, lng:number} | google.maps.LatLng;


/**********************************************************************************************
 * event types
 **********************************************************************************************/
export interface IListener {
  remove:()=>void
}
export interface IListenerController {
  (listen:boolean):IListenerController
}


/**
 * imgsrc.service types - Observables for IMG.src using async pipes in markup
 */
import { Observable, Subject } from 'rxjs';

export interface IImgSrc {
  key?: string
  src?: string;
  style?: {'width.px':string, 'height.px':string};
  title?: string;
  alt?: string;
  loading?: Promise<string>;
}

export interface IImgSrcItem {
  key: string; // use [dim,uuid].join(':')
  imgSrc: IImgSrc;
  imgSrc$: Observable<IImgSrc>;  // use async pipe in view to render IMG.src=imgSrc.src
  subj: Subject<IImgSrc>;
}


/**
 * AppCache types
 */
import { SubjectiveService } from './subjective.service';
export interface IMarkerSubject {
  uuid: string,
  parent?: IMarker;
  sibling?: SubjectiveService<IMarker>;   // deprecate
  child: SubjectiveService<IMarker>;  
}


/******************************************************************
 * cameraroll types
 */
import { PhotoLibrary, LibraryItem, AlbumItem, GetLibraryOptions, GetThumbnailOptions } from '@ionic-native/photo-library/ngx';

export interface IMoment extends AlbumItem {
  locations: string;  // comma delimited
  startDate: string;  // Date.toISOString()
  endDate: string;    // Date.toISOString()
  itemIds: string[];
  loc?: [number,number];
  _itemSubj?: Subject<IPhoto[]>;
  _items$?: Observable<IPhoto[]>;
  [propName:string]: any,
}

// export interface IPhotoLibraryMappi extends PhotoLibrary {
//   getMoments:(from?:string, to?:string)=>Promise<IMoment[]>
// }

export interface IExifPhoto {
  src: string,
  orientation: number,
  exif?: {
    DateTimeOriginal: string,
    PixelXDimension: number,
    PixelYDimension: number,
    [propName:string]: any,
  },
  gps?: {
    lat: number,
    lng: number,
    speed?: number
    [propName:string]: any,
  },
  tiff?: {
    Orientation: number,
    [propName:string]: any,
  },

  // TODO: move to _calcImgSrcDim(options)
  targetWidth?: number,
  targetHeight?: number,

  [propName: string]: any;
}

// update/extend interface definition
export interface IMappiGetLibraryOptions extends GetLibraryOptions {
  itemIds?: string[];         // get by LibraryItem.id
  includeImages?: boolean;
  includeCloudData?: boolean;
  maxItems?: number;
}

export interface IMappiGetThumbnailOptions extends GetThumbnailOptions {
  dataURL: boolean;
  maxItems?: number;
}



export interface IMappiLibraryItem extends LibraryItem {
  // e.g. "/Users/[...]/Devices/A11DA2A5-D033-40AA-BEE1-E2AA8281B774/data/Media/DCIM/100APPLE/IMG_0004.JPG"
  orientation?:number,
  '{Exif}'?:{
    DateTimeOriginal:string,
    PixelXDimension:number,
    PixelYDimension:number,
  },
  '{GPS}'?:{
    Altitude: number,
    Latitude: number,
    Longitude: number,
    Speed: number,
  },
  '{TIFF}'?:{
    Artist:string,
    Copyright:string,
    Orientation:number,
  }
  isFavorite?: boolean;
  representsBurst?: boolean;
  filePath?: string;
  momentId?: string;        
  _photo?: IPhoto;      // deprecate
}

export interface IChoosePhotoOptions {
  moments?:IMoment[]; 
  positions?:{lat:number, lng:number}[];
  bounds?:google.maps.LatLngBounds; 
  except?:string[];   // IMappiLibraryItem.id[] 
  provider?: string;
}
