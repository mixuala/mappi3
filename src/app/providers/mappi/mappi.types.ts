import { IMarker } from '../mock-data.service';



/**********************************************************************************************
 * map helpers
 **********************************************************************************************/
export interface IUuidMarker extends google.maps.Marker {
  uuid: string;
  [propName: string]: any;
}

// DB record which maps to a marker
export interface IMappiMarker extends IMarker {
  label?: string;
  // use for GoogleMapsComponent
  marker?: IUuidMarker;
  listeners?: any  // move to marker._listeners;
  [propName: string]: any;
}



/**********************************************************************************************
 * event helpers
 **********************************************************************************************/
export interface IListener {
  remove:()=>void
}
export interface IListenerController {
  (listen:boolean):IListenerController
}


