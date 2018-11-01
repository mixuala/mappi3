 /**
 * Caches for runtime values
 */
import { Plugins } from '@capacitor/core';

import { SubjectiveService } from './subjective.service';
import {PhotoLibraryHelper } from './photo/photo.service';
import {ImgSrc} from './photo/imgsrc.service';

import { IPhoto, IMarker } from './mock-data.service';
import { IImgSrc, IImgSrcItem } from './photo/imgsrc.service';
import { IMappiLibraryItem, IMoment, IExifPhoto } from './photo/photo.service';

const { Storage } = Plugins;


export interface IMarkerSubject {
  uuid: string,
  self: SubjectiveService<IMarker>;   // TODO: refactor, use siblings
  child: SubjectiveService<IMarker>;  // TODO: refactor, use children
}


export class CacheByKey<T> {



  constructor(options:any){
    const {className, storage} = options;
    this.className = className
    this.storage = storage;
  }
  storage: boolean;
  className: string;
  _cache:{ [uuid:string]:T } = {};
  reset(){ this._cache = {} }
  get(uuid:string):T { return this._cache[uuid] }
  set(item:T, key?:string):T { 
    // const className = item.className   // TODO: guard for className?
    key = key || item['uuid'] || item['id'];
    this._cache[key] = item;
    if (this.storage){
      const cleanForJSON = AppCache.cleanProperties(item);
      cleanForJSON['className'] = `cache-${this.className}`;
      const storageKey = `${key}-${cleanForJSON['className']}`;
      Storage.set({key:storageKey, value:JSON.stringify(cleanForJSON)});
    }
    return item
  }
  items():T[] {
    // const itemKeys = Object.keys(this._cache).filter(k=>k.length==43);
    // return itemKeys.map(k=>this._cache[k]);
    return Object.values(this._cache);
  }
}

export class Cache_WithSpareKeys<T> extends CacheByKey<T> {
  items():T[] {
    // duplicate keys to same Object, so return unique T
    const unique = [...Array.from( new Set( super.items() ) )];
    return unique;
  }
}

const CACHE_MIN = 100;
const CACHE_MAX = 200; 
export class Cache_WithMru<T> extends CacheByKey<T> {
  _mru:string[] = [];
  get(key:string):T { 
    this._mru.unshift(key);
    if (this._mru.length>CACHE_MAX) {
      const remove = this._mru.splice(CACHE_MIN, this._mru.length-CACHE_MIN );
      remove.forEach( key=>this._cache[key]);
    }
    return super.get(key);
  }
  reset(){ super.reset(); this._mru = []; }
}

/**
 * usage:
 *  AppCache.init()
 *  AppCache.loadFromStorage()
 *  cache = AppCache.for('Cameraroll')
 */
export class AppCache {
  static _cache: {[name:string]: CacheByKey<any>} = {};
  static for (name:string):CacheByKey<any> {
    return AppCache._cache[name];
  }
  static keys (){ return Object.keys(AppCache._cache) }
  static counts (){ 
    const counts = Object.entries(AppCache._cache).map( ([k,v])=>[k,v.items().length]);
    return JSON.stringify(counts);
  }
  static init(){
    // NOTE: AppCache.for('Photo'), restore cache from MockDataService.loadStorage()
    // NOTE: use keys = [IPhoto.uuid, IMappiLibraryItem.id]
    // refactor, deprecate IMappiLibraryItem._photo, lookup with spare key;
    AppCache._cache['Photo'] = new Cache_WithSpareKeys<IPhoto>({className:'Photo', storage:false});
    // NOTE: use keys = [IPhoto.uuid, IMappiLibraryItem.id]
    AppCache._cache['Cameraroll'] = new CacheByKey<IMappiLibraryItem>({className:'Cameraroll', storage:true});
    AppCache._cache['Moment'] = new Cache_WithSpareKeys<IMoment>({className:'Moment', storage:true});
    // NOTE: dataUrls, do not put into Storage
    AppCache._cache['ImgSrc'] = new Cache_WithMru<IImgSrcItem>({className:'ImgSrc', storage:false});
    // NOTE: get sibling & child markers by IMarker.uuid
    AppCache._cache['IMarker'] = new CacheByKey<IMarkerSubject>({className:'IMarker', storage:false});
  }
  static loadFromStorage(){
    // restore cache from Storage
  }


  /**
   * helpers
   */
  static findItemByFingerprint(data:IExifPhoto):IMappiLibraryItem {
    try {
      if (!data.exif) return null;

      let match = data.exif.DateTimeOriginal;
      let found:IMappiLibraryItem[] = AppCache.for('Cameraroll').items()
      .filter( o=>{
        return o["{Exif}"] && o["{Exif}"].DateTimeOriginal==match;
      });
      if (found.length == 0) return null; 
      if (found.length == 1) return found[0];

      match = data.exif.SubsecTimeOriginal;
      found = found.filter( o=>{
        return o["{Exif}"] && o["{Exif}"]['SubsecTimeOriginal']==match;
      });
      if (found.length == 1) return found[0];
    }
    catch (err) {}
    return null;
  }

  static cleanProperties(o, keys?:string[]){
    // build whitelist of safe properties for JSON.stringify()
    let whitelist = Object.keys(o).filter( k=>!k.startsWith('_'));
    if (keys) whitelist = keys.filter( k=>whitelist.includes(k));
    const clean = whitelist.reduce( (res,k)=>{
      res[k] = o[k];
      return res;
    },{});
    return clean;
  }

  static findMomentByItemId(id:string):IMoment{
    return AppCache.for('Moment').items().find( (m:IMoment)=>m.itemIds.includes(id) );
  }


  // const check = AppCache.for('Moment').items().reduce( (res,m)=>res.concat(m.itemIds), [] )


}




/**
 * refactor
PhotoLibraryHelper.get( => AppCache.for('Cameraroll').get(
PhotoLibraryHelper.set( => AppCache.for('Cameraroll').set(
PhotoLibraryHelper.items( => AppCache.for('Cameraroll').items(    
 *  */ 