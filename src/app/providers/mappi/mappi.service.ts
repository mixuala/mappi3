import { Injectable } from '@angular/core';

import {
  IMarker, IUuidMarker, IMappiMarker, IPoint,
  IListener, IListenerController
} from '../types';

/**
 * helper class for manipulating UuidMarkers
 * usage:
    const marker = MappiMarker.make(uuid, [google.maps.Marker]);
    marker.destroy();
    const markers = MappiMarker.getWithin( bounds:google.maps.LatLngBounds );
 */
export class MappiMarker {
  static markers: IMappiMarker[] = [];

  static make (mm:IMappiMarker, o:google.maps.Marker | google.maps.MarkerOptions, map:google.maps.Map): IUuidMarker {
    const uuid = mm.uuid;
    let m = (o instanceof google.maps.Marker) ? o : new google.maps.Marker(o);
    const found = MappiMarker.markers
      .filter( mm=>mm._marker['mapId']==map['id'] )
      .find( mm=>mm.uuid == uuid);
    if (found && found._marker){
      console.warn("warning: marker.uuid exists", found, MappiMarker.markers.length);
      return found._marker;
    }
    // 'augment' google.maps.Marker => IUuidMarker
    Object.assign(m, {
      'uuid': uuid,
      'mapId': map['id'],
    });
    mm._marker =  m as IUuidMarker;
    MappiMarker.markers.push(mm);
    return mm._marker;
  }

  static remove (map:google.maps.Map, list?:IMappiMarker[]):number {
    const toRemove:number[] = [];
    MappiMarker.markers.forEach( (o,i)=>{
      const marker = o._marker;
      if (marker.mapId==map['id']){
        if (!list)
          toRemove.push(i);
        else {
          const found = list.find( p=>p.uuid==o.uuid );
          if (found) toRemove.push(i);
        }
      }
    });
    const safeRemove = toRemove.reverse();
    let removed = 0;
    safeRemove.forEach( i=>{
      // const remove:google.maps.Marker = MappiMarker.markers.splice(found,1);
      const remove:IMappiMarker = MappiMarker.markers.splice(i,1)[0];
      const marker = remove._marker;
      marker.setMap(null);
      if (list){
        const mm = list.find( o=>o.uuid==marker.uuid);
        if (mm){
          mm._marker = null;
          delete mm['_marker'];
        }
      }
      removed++;
    })
    return removed;
  }  

  static visible(mapId:string):IMappiMarker[] {
    return MappiMarker.markers
      .filter( mm=>mm._marker['mapId']==mapId )
      .filter( mm=>mm._marker && mm._marker.getMap() && mm['_rest_action']!='delete');
  }

  /**
   *  hide(): remove a list of markers from the google.map.Map
   *  WARNING: does not delete the marker, still referenced by IMappiMarker._marker
   */ 
  static hide (list:IUuidMarker[]=[]):number {
    let found = 0;
    const notFound = [];
    list.forEach( (m)=>{
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
    MappiMarker.hide(MappiMarker.markers.map(mm=>mm._marker));
  }

  static findByUuid( uuids:string[], mapId:string ) : IUuidMarker[] {
    return MappiMarker.markers.filter( mm=>uuids.includes(mm.uuid))
    .filter( mm=>mm._marker['mapId']==mapId ).map( mm=>mm._marker );  
  }
  static find( markers:IUuidMarker[], mapId:string ) : IUuidMarker[] {
    return MappiMarker.markers.filter( mm=>{
      if (!markers) return true;
      return markers.includes(mm._marker);
    })
    .filter( mm=>mm._marker['mapId']==mapId ).map( mm=>mm._marker );   
  }
  /**
   * Find all markers by map, except for the ones provided
   * @param markers markers to exclude
   * @param mapId 
   */
  static except( markers: IMarker[], mapId:string) : IUuidMarker[] {
    const excludeUuids = markers.map(mm=>mm.uuid);
    const remainingUuids = MappiMarker.markers.filter( mm=>!excludeUuids.includes(mm.uuid))
    .filter( mm=>mm._marker['mapId']==mapId ).map(mm=>mm.uuid);
    return MappiMarker.findByUuid(remainingUuids, mapId);
  }

  static findWithin (bounds: google.maps.LatLngBounds, items: IMappiMarker[], mapId:string): IUuidMarker[] {
    const find = items.reduce( (res:string[], o:IMappiMarker) => {
      const position = {
        lat: o.loc[0] + o.locOffset[0],
        lng: o.loc[1] + o.locOffset[1],
      }
      if (bounds.contains(position)) res.push(o.uuid);
      return res;
    }, []);
    const found = MappiMarker.markers.filter( mm=>mm._marker['mapId']==mapId )
    .filter( mm=>find.includes(mm.uuid)).map( mm=>mm._marker );  
    return found;
  }

  static getBounds ( items: IMappiMarker[] ): google.maps.LatLngBounds {
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
   * 
   * additional helper functions
   */
  static getBoundsLoc(bounds:google.maps.LatLngBounds):[number,number]{
    const {south, west, north, east} = bounds.toJSON();
    return [(south+north)/2, (west+east)/2];
  }

  

  static getDistanceBetween(here:IPoint, there:IPoint):number{
    const [a, b] = [here, there].map( (p:IPoint)=>{
      if (p instanceof google.maps.LatLng) return p;
      if (p instanceof Array) return new google.maps.LatLng(p[0], p[1]);
      return new google.maps.LatLng(p.lat, p.lng);
    });
    return google.maps.geometry.spherical.computeDistanceBetween(a,b);
  }

  
  /**
   *   latlng bounds of the central portion of map at current zoom 
   * @param map google.map.Maps
   * @param coverage integer percent coverage of map. 50=50% or half the current map
   */
  static mapCentral(map:google.maps.Map, coverage:number=50):google.maps.LatLngBounds {
    const {lat, lng} = map.getCenter().toJSON();
    const bounds = map.getBounds();
    const central = new google.maps.LatLngBounds(null);
    const delta_h = (lng-bounds.getSouthWest().lng()) * (coverage/100);
    const delta_w = (lat-bounds.getSouthWest().lat()) * (coverage/100);
    central.extend( {lat: lat-delta_w, lng: lng-delta_h} );  // sw
    central.extend( {lat: lat+delta_w, lng: lng+delta_h} );  // ne
    return central;
  }

  static panToBounds(map:google.maps.Map, point?:google.maps.LatLng|google.maps.LatLngLiteral, coverage:number=50): google.maps.LatLngBounds {
    let {lat, lng} = map.getCenter().toJSON();
    const bounds = map.getBounds();
    const delta_h = (lng-bounds.getSouthWest().lng()) * (coverage/100);
    const delta_w = (lat-bounds.getSouthWest().lat()) * (coverage/100);
    
    let target = point instanceof google.maps.LatLng ? point.toJSON() : point;
    if (!target) target = {lat,lng};
    const newBounds = new google.maps.LatLngBounds(null);
    newBounds.extend( {lat: target.lat-delta_w, lng: target.lng-delta_h} );  // sw
    newBounds.extend( {lat: target.lat+delta_w, lng: target.lng+delta_h} );  // ne
    return newBounds;
  }



  /**
   * ImappiMarker (item) methods
   */


  // true if item.loc!=[0,0]
  static hasLoc(item:IMarker):boolean {
    return item && item.loc.join()!=[0,0].join();
  }

  static position(item: IMarker): {lat, lng} {
    const offset = item.locOffset || [0,0];
    return {
      lat: item.loc[0] + offset[0],
      lng: item.loc[1] + offset[1],
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
  static instances: IListenerController[] = [];
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
  static make( addListener:()=>IListener ) : IListenerController {
    let listener: IListener;
    const retval = (listen:boolean|string): IListenerController => {
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
