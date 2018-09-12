/**********************************************************************************************
 * map helpers
 **********************************************************************************************/
export interface IUuidMarker extends google.maps.Marker {
  uuid: string;
}

// DB record which maps to a marker
export interface IMappiMarker {
  uuid: string;
  loc:[number, number];
  locOffset:[number, number];
  label?: string;
  position?:{
    lat: ()=>number | number,
    lng: ()=>number | number,
  }
  marker?: IUuidMarker;
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


