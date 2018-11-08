/**
 * for all methods related to async imgSrc loading and rendering by Observers with async pipes
 */
import { Injectable, Pipe, PipeTransform, } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Plugins, AppState } from '@capacitor/core';
import { Platform } from '@ionic/angular';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { map, take, skipWhile }  from 'rxjs/operators'

import { MockDataService, IPhoto } from '../mock-data.service';
import { PhotoLibraryHelper } from './photo.service';
import { AppConfig, ScreenDim } from '../helpers';
import { SubjectiveService } from '../subjective.service';
import { AppCache } from '../appcache';

const { Storage } = Plugins;

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
      // console.warn( "@@@ fake cameraroll, async delay for id=", photo.uuid)
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
    // public dataService: MockDataService,
    // private platform: Platform,
  ) {
    // // see: AppComponent.exposeDebug()
    window['_ImgSrc'] = ImgSrc; 
  }

  static handleAppStateChange(state:AppState){
    if (state.isActive){
      ImgSrc.retryBroken();
      console.warn( "&&& AppState restored. ImgSrc items...", AppCache.for('ImgSrc').items().map(o=>o.key).slice(0,3));
    }
    else {
      console.warn( "&&& AppState inactive. ImgSrc item count=", AppCache.for('ImgSrc').items().map(o=>o.key).length)
    }
  }


  /**
   * 
   * @param photo 
   * @param pixelRatio 
   * @returns a dim string sized to (device) fullscreen or window size
   */
  static async scaleDimToScreen( photo:IPhoto, screenDim?:string, pixelRatio?:number ):Promise<string>{
    if (!pixelRatio) pixelRatio = AppConfig.devicePixelRatio;
    if (!screenDim) screenDim = await ScreenDim.dim;
    const {width , height } = photo;
    const [fitW, fitH] = screenDim.split('x').map(v=>parseInt(v));
    const scale = Math.min( fitW/width, fitH/height ) * pixelRatio;
    const scaled = [Math.round(width*scale), Math.round(height*scale)].join('x') as string;
    return Promise.resolve(scaled);
  }


  static getEmptyImgSrc(dim:string='80x80'):IImgSrc {
    const [imgW, imgH] = dim.split('x');
    return {
      key: dim,
      src: null,
      style: {'width.px':imgW, 'height.px':imgH},
    }
  }

  static retryBroken(filter?: string[]) {
    console.log('calling "retryBroken()')
    const broken:IImgSrcItem[] = AppCache.for('ImgSrc').items().filter(o=>o.imgSrc.src==null);
    broken.forEach( cacheItem=>{
      const [dim, uuid] = cacheItem.key.split(':');
      if (filter && filter.includes(uuid)==false) return; // skip

      const photo:IPhoto = AppCache.for('Photo').get(uuid);
      if (!photo) console.warn("retryBroken(), photo not found, uuid=", uuid);
      else {
        // retry
        delete cacheItem['loading'];
        this.getImgSrc$(photo, dim, false);
      }
    })
  }

  /**
   * 
   * use with:  <ion-thumbnail *ngIf="(photo._imgSrc$ | async) as imgSrc">
   *              <img [src]="imgSrc.src">
   *            </ion-thumbnail>
   * 
   * @param libraryItem 
   * @param dim 
   * @returns {} or valid IThumbSrc
   */
  static getImgSrc$(photo:IPhoto, dim:string='80x80', force:boolean=false):Observable<IImgSrc> {

    const [imgW, imgH] = dim.split('x');
    let cacheItem:IImgSrcItem;

    // check cache
    const cached:IImgSrcItem = AppCache.for('ImgSrc').get([dim,photo.uuid].join(':'));
    if (cached && !force) {
      if (cached['loading'] || cached.imgSrc.src){
        // good or still loading...
        return cached.imgSrc$;
      }
      else {
        // something is wrong, need to retry, 
        cacheItem = cached;
        if (cacheItem.subj.observers.length){
          // (?) but do NOT reset observer, because someone might be subscribed...
          console.warn("&&& retry getImgSrc$()...", cacheItem);
        }
        else {
          cacheItem.imgSrc$ = cacheItem.subj.asObservable();
        }
      }
    }
    else {
      if (cached) {
        // force==true, delete from cache
        delete AppCache.for('ImgSrc')._cache[cached.key];
      }

      // start fresh
      const imgSrcSubject = new BehaviorSubject<IImgSrc>({});
      cacheItem = {
        key: [dim,photo.uuid].join(':') as string,
        imgSrc: ImgSrc.getEmptyImgSrc(dim),
        subj: imgSrcSubject,
        imgSrc$: imgSrcSubject.asObservable(),
      };
    }


    // cache value and return
    /**
     * load imgSrc async
     */
    const loadImgSrc = (cacheItem:IImgSrcItem):Promise<void> => {
      if (photo.camerarollId == 'fake'){
        // set in MockDataService.inflatePhoto()
        cacheItem['loading'] = DEV_async_getSrc(photo, dim)
        .then( imgSrc=>{
          cacheItem.imgSrc.src = imgSrc;
          delete cacheItem['loading'];  // wait for promise to complete
          return;
        })
      }
      else if (photo.camerarollId){
        // cameraroll photo, use PhotoLibrary.getThumbnail( {dataURL:true})
        const options = { 
          thumbnailWidth: parseInt(imgW), 
          thumbnailHeight: parseInt(imgH),
          quality: 85,
          dataURL: true,
        }
        cacheItem['loading'] = PhotoLibraryHelper.getDataURLFromCameraRoll(photo, options)
        .then( 
          imgSrc=>{
            cacheItem.imgSrc.src = imgSrc;
            delete cacheItem['loading'];  // wait for promise to complete
            // console.warn(`@@@ cameraroll CHANGED src.length=${imgSrc.length}, `, cacheItem.key, imgSrc.slice(0,50));
            return;
          }
          ,(err)=>{
            console.warn('&&& Error getting dataURL for cacheItem=', cacheItem, err);
          }
        )
      }
      else if ("GET FROM REST API"){
        /**
         * photo in cloud, but not cached, fetch src with proper size spec
         *    NOTE: just mangling url for https://picsum.photos
         * */
        cacheItem['loading'] = DEV_async_getSrc(photo, dim)
        .then( imgSrc=>{
          cacheItem.imgSrc.src = imgSrc; 
          delete cacheItem['loading'];  // wait for promise to complete
          return;
        })
      }
      return cacheItem['loading'];
    }
    loadImgSrc(cacheItem).then( ()=>{
      // push result to Observers
      cacheItem.subj.next(cacheItem.imgSrc);
    });
    AppCache.for('ImgSrc').set(cacheItem);
    return cacheItem.imgSrc$;
  }
  
  

}

