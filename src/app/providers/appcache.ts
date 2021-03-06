 /**
 * Caches for runtime values
 */
import { Plugins, AppState } from '@capacitor/core';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto,
  IImgSrc, IImgSrcItem,
  IMappiLibraryItem, IMoment, IExifPhoto,
  IMarkerSubject, IFavorite,
} from './types';

const { Storage } = Plugins;



export class CacheByKey<T> {

  constructor(options:any){
    const {className, storage} = options;
    this.className = className
    this.storage = storage;
  }
  storage: boolean;
  className: string;
  _cache:{ [uuid:string]:T } = {};
  reset(){ 
    this._cache = {};
    if (this.storage) {
      const key = `cache-${this.className}`;
      Storage.remove({key});  
    }
  }
  get(uuid:string):T { return this._cache[uuid] }
  set(item:T, key?:string):T { 
    // const className = item.className   // TODO: guard for className?
    key = key || item['uuid'] || item['id'];
    if (!key) {
      console.error("AppCache, cache key not found", item);
      return;
    }
    // this._cache[key] = item;
    this._cache[key] = Object.assign({},item);  // copy of item
    if (this.storage){
      // const cleanForJSON = AppCache.cleanProperties(item);
      // cleanForJSON['className'] = `cache-${this.className}`;
      // const storageKey = `${key}-${cleanForJSON['className']}`;
      // Storage.set({key:storageKey, value:JSON.stringify(cleanForJSON)});
    }
    return this._cache[key];
  }
  remove(item:string|T):boolean{
    const key = (typeof item == 'string') ? item : item['uuid'] || item['id'];
    const found = !!this._cache[key];
    if (found) {
      delete this._cache[key];
      if (this.storage){
        // const cleanForJSON = AppCache.cleanProperties(item);
        // cleanForJSON['className'] = `cache-${this.className}`;
        // const storageKey = `${key}-${cleanForJSON['className']}`;
        // Storage.set({key:storageKey, value:JSON.stringify(cleanForJSON)});
      }
    }
    return found;
  }
  items():T[] {
    // const itemKeys = Object.keys(this._cache).filter(k=>k.length==43);
    // return itemKeys.map(k=>this._cache[k]);
    return Object.values(this._cache) as T[];
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
    // NOTE: use keys = [IPhoto.uuid, IMappiLibraryItem.id]
    AppCache._cache['Photo'] = new Cache_WithSpareKeys<IPhoto>({className:'Photo', storage:false});
    AppCache._cache['Cameraroll'] = new CacheByKey<IMappiLibraryItem>({
      className:'Cameraroll', storage:true
    });
    AppCache._cache['Moment'] = new Cache_WithSpareKeys<IMoment>({className:'Moment', storage:true});
    // NOTE: dataUrls, do not put into Storage
    AppCache._cache['ImgSrc'] = new Cache_WithMru<IImgSrcItem>({className:'ImgSrc', storage:false});
    // NOTE: get sibling & child markers by IMarker.uuid
    AppCache._cache['IMarkerSubj'] = new CacheByKey<IMarkerSubject>({className:'IMarkerSubj', storage:false});
    AppCache._cache['Favorite'] = new CacheByKey<IFavorite>({className:'Favorite', storage:true});
    // use for passing objects between components/pages
    AppCache._cache['Key'] = new CacheByKey<any>({className:'Key', storage:false});
    // restore
    AppCache.handleAppStateChange({isActive:true});
  }



  /**
   * static methods
   */
  static async handleAppStateChange(state:AppState){
    const keys = AppCache.keys();
    keys.forEach( cacheName=>{
      if (AppCache.for(cacheName).storage==false) 
        return;
      if (state.isActive){
        AppCache.loadByClassName(cacheName);
      }
      else {
        AppCache.storeByClassName(cacheName);
      }
    })
  }

  static async loadFromStorage(cacheName:string):Promise<any[]>{
    // restore cache from Storage
    const cache = AppCache.for(cacheName);
    if (cache.storage == false) return;

    const search = `cache-${cache.className}`;
    let resp = await Storage.keys();
    const keys = resp.keys.filter( v=>v.endsWith(search));

    const items:any[] = [];
    keys.forEach( async (key)=>{
      try {
        const resp = await Storage.get({key});
        const item = JSON.parse(resp['value']);
        items.push(item);
      } catch(err) {
        console.error(`ERROR: JSON.parse()`, err);
      }
    });
    return items;
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

  static async storeByClassName(className:string):Promise<void>{
    try {
      const cache = AppCache.for(className);
      if (!cache || cache.storage==false) throw new Error(`ERROR: storeByClassName() - cannot save to Storage, className=${className}`);
      
      const cleanedItems = cache.items().map(o=>AppCache.cleanProperties(o));
      const key = `cache-${className}`;
      await Storage.set({key, value:JSON.stringify(cleanedItems)});
      return Promise.resolve();
    } catch (err){
      console.error(err);
      return Promise.reject(err);
    }
  }

  static async loadByClassName(className:string):Promise<any[]>{
    try {
      const cache = AppCache.for(className);
      if (!cache || cache.storage==false) 
        throw new Error(`ERROR: loadByClassName() - cannot save to Storage, className=${className}`);
      const key = `cache-${className}`;
      const resp:any = await Storage.get({key});
      const items = JSON.parse(resp['value']);
      if (items)
        items.forEach( o=>AppCache.for(className).set(o));
      return Promise.resolve(items);

    } catch (err){
      console.error(err);
      return Promise.reject(err);
    }
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