/**
 * for all methods related to async imgSrc loading and rendering by Observers with async pipes
 */
import { Injectable, Pipe, PipeTransform, } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Platform } from '@ionic/angular';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { map, take, skipWhile }  from 'rxjs/operators'

import { MockDataService, IPhoto } from '../mock-data.service';
import { PhotoLibraryHelper } from './photo.service';


/**
 * 
 * UNUSED ???
 * pipes for IMG.src = base64 dataURL
 * 
 */
@Pipe({name: 'dataurl'})
export class DataURLPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}
  transform(url: string) {
    return url && url.startsWith('data:image/') ? this.sanitizer.bypassSecurityTrustUrl(url) : url;
  }
}

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

const CACHE_MIN = 100;
const CACHE_MAX = 200; 
/**
 *    NOTE: just mangling url for https://picsum.photos
 * */
const DEV_async_getSrc = (photo:IPhoto, dim:string='80x80'):Promise<string> => {
  return new Promise( (resolve, reject)=>{
    setTimeout( ()=>{
      console.warn( "@@@ fake cameraroll, async delay for id=", photo.uuid)
      const src = photo.src.replace(/\d+\/\d+/, dim.replace('x','/'))
      resolve(  src  );
    },100);
  });
}

@Injectable({
  providedIn: 'root'
})
export class ImgSrc {
  constructor(
    public dataService: MockDataService,
    private platform: Platform,
  ) { 
    // reset caches, currently not put in Storage

  }
  /**
   * cache for all IImgSrcItem
   * use: 
   *  - ImgSrc.get( Photo.uuid, dim )
   */
  private static _cache:{ [key:string]:IImgSrcItem } = {};
  private static _mru:string[] = []; 
  static reset(){ ImgSrc._cache = {}; ImgSrc._mru = []; }
  static get(uuid:string, dim:string="80x80"):IImgSrcItem { 
    const key = [dim,uuid].join(':');
    ImgSrc._mru.unshift(key);
    if (ImgSrc._mru.length>CACHE_MAX) {
      const remove = ImgSrc._mru.splice(CACHE_MIN, ImgSrc._mru.length-CACHE_MIN );
      remove.forEach( key=>ImgSrc._cache[key]);
    }
    return ImgSrc._cache[key];
  }
  static set(item:IImgSrcItem):IImgSrcItem { return ImgSrc._cache[item.key] = item }
  static items():IImgSrcItem[] {
    return Object.values(ImgSrc._cache);
  }  


  static getEmptyImgSrc(dim:string='80x80'):IImgSrc {
    const [imgW, imgH] = dim.split('x');
    return {
      key: dim,
      src: null,
      style: {'width.px':imgW, 'height.px':imgH},
    }
  }

  /**
   * 
   * use with: <app-mappi-image [thumbSrc]="photo._thumbSrc$ | async"></app-mappi-image>
   * 
   * @param libraryItem 
   * @param dim 
   * @returns {} or valid IThumbSrc
   */
  static getImgSrc$(photo:IPhoto, dim:string='80x80', force:boolean=false):Observable<IImgSrc> {

    // check cache
    const cached = ImgSrc.get(photo.uuid, dim);
    if (cached && !force) {
      return cached.imgSrc$;
    }

    const imgSrcSubject = new BehaviorSubject<IImgSrc>({});
    const cacheItem:IImgSrcItem = {
      key: [dim,photo.uuid].join(':'),
      imgSrc: ImgSrc.getEmptyImgSrc(dim),
      subj: imgSrcSubject,
      imgSrc$: imgSrcSubject.asObservable(),
    }
    const [imgW, imgH] = dim.split('x');

    // cache value and return
    /**
     * load imgSrc async
     */
    const loadImgSrc = async (cacheItem:IImgSrcItem):Promise<IImgSrc> => {
      if (photo.camerarollId == 'fake'){
        // set in MockDataService.inflatePhoto()
        const imgSrc = await DEV_async_getSrc(photo, dim)
        cacheItem.imgSrc.src = imgSrc; 
      }
      else if (photo.camerarollId){
        // cameraroll photo, use PhotoLibrary.getThumbnail( {dataURL:true})
        const options = { 
          thumbnailWidth: parseInt(imgW), 
          thumbnailHeight: parseInt(imgH),
          dataURL: true,
        }
        const imgSrc = await PhotoLibraryHelper.getDataURLFromCameraRoll(photo, options)
        cacheItem.imgSrc.src = imgSrc;
        console.warn(`@@@ cameraroll CHANGED src.length=${imgSrc.length}, `, cacheItem.key, imgSrc.slice(0,50));
      }
      else if ("GET FROM REST API"){
        /**
         * photo in cloud, but not cached, fetch src with proper size spec
         *    NOTE: just mangling url for https://picsum.photos
         * */
        const imgSrc = await DEV_async_getSrc(photo, dim)
        cacheItem.imgSrc.src = imgSrc; 
      }
      return cacheItem.imgSrc;
    }
    loadImgSrc(cacheItem).then( imgSrc=>{
      // push result to Observers
      cacheItem.subj.next(cacheItem.imgSrc);
    });
    ImgSrc.set(cacheItem)
    return cacheItem.imgSrc$;
  }
  
  

}

