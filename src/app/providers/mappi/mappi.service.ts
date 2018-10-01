import { Injectable } from '@angular/core';
import * as mappi from './mappi.types';
import { IMarker } from '../mock-data.service';

/**
 * helper class for manipulating UuidMarkers
 * usage:
    const marker = MappiMarker.make(uuid, [google.maps.Marker]);
    marker.destroy();
    const markers = MappiMarker.getWithin( bounds:google.maps.LatLngBounds );
 */
export class MappiMarker {
  static markers: mappi.IUuidMarker[] = [];

  static make (uuid:string, o?:google.maps.Marker | google.maps.MarkerOptions): mappi.IUuidMarker {
    let m = (o instanceof google.maps.Marker) ? o : new google.maps.Marker(o);
    // for DEV only
    if (typeof uuid == 'number') uuid = `${uuid}`;
    const found = MappiMarker.markers.find( m=>m.uuid == uuid);
    if (found){
      console.warn("warning: marker.uuid exists", found, MappiMarker.markers.length);
      return found;
    }
    // 'augment' google.maps.Marker => mappi.IUuidMarker
    Object.assign(m, {
      'uuid': uuid,
    });
    const marker = m as mappi.IUuidMarker

    MappiMarker.markers.push(marker);
    return marker;
  }

  static remove (list:mappi.IMappiMarker[]=[]):number {
    let removed = 0;
    for (const mm of list) {
      const found = MappiMarker.markers.findIndex( (m)=>m.uuid == mm.uuid );
      if (~found)  {
        // const remove:google.maps.Marker = MappiMarker.markers.splice(found,1);
        const remove:mappi.IUuidMarker = MappiMarker.markers.splice(found,1)[0];
        remove.setMap(null);
        mm.marker = null;
        delete mm['marker'];
        removed++;
      }
    }
    return removed;
  }  

  /**
   *  hide(): remove a list of markers from the google.map.Map
   *  WARNING: does not delete the marker, still referenced by IMappiMarker.marker
   */ 
  static hide (list:mappi.IUuidMarker[]=[]):number {
    let found = 0;
    const notFound = [];
    list.forEach( m=>{
      if (m instanceof google.maps.Marker){
        m.setMap(null);
        found ++;
      }
      else notFound.push(m);
    })
    if (notFound.length)
      console.warn("MappiMarker.hide(): some markers were not valid", notFound);
    return found;
  }

  static reset() {
    MappiMarker.hide(MappiMarker.markers);
  }

  static findByUuid( uuids:string[] ) : mappi.IUuidMarker[] {
    return MappiMarker.markers.filter( m=>uuids.includes(m.uuid));  
  }
  static find( markers:mappi.IUuidMarker[] ) : mappi.IUuidMarker[] {
    return MappiMarker.markers.filter( m=>markers.includes(m));
  }

  static except( markers: mappi.IUuidMarker[]) : mappi.IUuidMarker[] {
    return markers.filter( m=>!MappiMarker.markers.includes( m ));
  }

  static findWithin (bounds: google.maps.LatLngBounds, items: mappi.IMappiMarker[]): mappi.IUuidMarker[] {
    const find = items.reduce( (res:string[], o:mappi.IMappiMarker) => {
      const position = {
        lat: o.loc[0] + o.locOffset[0],
        lng: o.loc[1] + o.locOffset[1],
      }
      if (bounds.contains(position)) res.push(o.uuid);
      return res;
    }, []);
    const found = MappiMarker.markers.filter( m=>find.includes(m.uuid));
    return found;
  }

  static getBounds ( items: mappi.IMappiMarker[] ): google.maps.LatLngBounds {
    const bounds = new google.maps.LatLngBounds();
    items.forEach( m => {
      const position = {
        lat: m.loc[0] + m.locOffset[0],
        lng: m.loc[1] + m.locOffset[1],
      }
      bounds.extend(position);
    })
    return bounds;
  }





  /**
   * ImappiMarker (item) methods
   */

  static position(item: IMarker): {lat, lng} {
    const offset = item.locOffset || [0,0];
    return {
      lat: item.loc[0] + offset[0],
      lng: item.loc[1] + offset[1],
    }
  }

  static asPositionLabel(p:IMarker, n:number=6){
    if (!p.position) return
    const digits = Math.pow(10,n);
    return {
      lat: Math.round(p.position.lat*digits)/digits,
      lng: Math.round(p.position.lng*digits)/digits,
    }
  }

  static moveItem (item: IMarker, marker: google.maps.Marker) {
    const MAX_OFFSET = [0.001296216636290648, 0.0011265277862548828];
    const offset = MappiMarker.getMarkerOffset(marker, item.loc);
    const isTooFar = Math.abs(offset[0]) > MAX_OFFSET[0]/2  ||  Math.abs(offset[1]) > MAX_OFFSET[1]/2
    if (isTooFar && item.hasOwnProperty('markerItemIds')) {
      // only relocate markers, IPhotos do not lose original position
      const [lat0, lng0] = item.loc;
      item.loc = [ lat0+offset[0], lng0+offset[1] ];
      item.locOffset = [0,0];
    } else item.locOffset = offset;
    item.position = MappiMarker.position(item);
    console.warn("BUG: IPhoto.seq sometimes changes on drag")
    // console.warn("MappiMarker.moveItem(): emit item.moved event");
  }   

  static getMarkerOffset (marker:google.maps.Marker, loc:[number,number]): [number,number] {
    // calculate loc+offset from position
    let {lat, lng} = marker.getPosition().toJSON();
    const [lat0, lng0] = loc;
    const offset:[number, number] = [lat-lat0, lng-lng0];
    console.log(`MappiMarker.getMarkerOffset(): loc:${[lat0, lng0]}, offset=${offset}`);
    return offset;
  }

}




@Injectable({
  providedIn: 'root'
})
export class MappiService {

  constructor() { }
}


/**********************************************************************************************
 * other helper classes
 **********************************************************************************************/
export class ListenerWrapper {
  constructor(){ }
  static instances: mappi.IListenerController[] = [];
  /**
   * 
   * wraps a listener/handler to call with listen/stop/'toggle' param
   * 
   * usage:
      const helper = ListenerWrapper.make( 
        ()=>{
            return google.maps.event.addListener(self.map, "click", addMarkerOnClick);
          } 
      )
      helper([true | false | 'toggle' ]);

   * @param addListener ()=>{  return xxx.addListener('[event]', handler); }
   * @returns (listen:boolean)=>void
   */
  static make( addListener:()=>mappi.IListener ) : mappi.IListenerController {
    let listener: mappi.IListener;
    const retval = (listen:boolean|string): mappi.IListenerController => {
      if (listen==='toggle'){
        listen = !!listener;
      }
      if (listen){
        if (!listener)    
          listener = addListener();
      }
      else {
        listener && listener.remove();
        listener = null;
      }
      // what happens when the objects inside addListener() are destroyed
      return retval
    }
    ListenerWrapper.instances.push(retval);
    return retval   
  }
} 


// from: https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
//       https://codepen.io/avesus/pen/wgQmaV?editors=0012
export function quickUuid():string {
  return quickUuid.prototype.formatUuid(quickUuid.prototype.getRandomValuesFunc());
}
quickUuid.prototype.lut = Array(256).fill(null).map((_, i) => (i < 16 ? '0' : '') + (i).toString(16));
quickUuid.prototype.formatUuid = ({d0, d1, d2, d3}) => {
  const lut = quickUuid.prototype.lut;
  return lut[d0       & 0xff]        + lut[d0 >>  8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
  lut[d1       & 0xff]        + lut[d1 >>  8 & 0xff] + '-' +
  lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
  lut[d2       & 0x3f | 0x80] + lut[d2 >>  8 & 0xff] + '-' +
  lut[d2 >> 16 & 0xff]        + lut[d2 >> 24 & 0xff] +
  lut[d3       & 0xff]        + lut[d3 >>  8 & 0xff] +
  lut[d3 >> 16 & 0xff]        + lut[d3 >> 24 & 0xff];
}
quickUuid.prototype.getRandomValuesFunc = window.crypto && window.crypto.getRandomValues ?
  () => {
    const dvals = new Uint32Array(4);
    window.crypto.getRandomValues(dvals);
    return {
      d0: dvals[0],
      d1: dvals[1],
      d2: dvals[2],
      d3: dvals[3],
    };
  } :
  () => ({
    d0: Math.random() * 0x100000000 >>> 0,
    d1: Math.random() * 0x100000000 >>> 0,
    d2: Math.random() * 0x100000000 >>> 0,
    d3: Math.random() * 0x100000000 >>> 0,
  });
