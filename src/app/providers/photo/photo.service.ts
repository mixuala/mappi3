import { ChangeDetectorRef, Injectable, Pipe, PipeTransform, } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Platform } from '@ionic/angular';
import { Observable, ReplaySubject, BehaviorSubject } from 'rxjs';
import { map, take, skipWhile }  from 'rxjs/operators'

import { Plugins } from '@capacitor/core';
import * as Camera from '@ionic-native/camera/ngx';
import { PhotoLibrary, LibraryItem, GetLibraryOptions, GetThumbnailOptions } from '@ionic-native/photo-library/ngx';
import { WebView } from '@ionic-native/ionic-webview/ngx';

import { ImgSrc, IImgSrc } from './imgsrc.service';
import { AppComponent } from '../../app.component';
import { MockDataService, RestyTrnHelper, IMarker, IPhoto, quickUuid } from '../mock-data.service';
import { SubjectiveService } from '../subjective.service';
import { MappiMarker } from '../mappi/mappi.service';

const { Device } = Plugins;
let PhotoLibraryCordova:any = null;

/**
 * pipes for IMG.src = base64 dataURL
 */
@Pipe({name: 'dataurl'})
export class DataURLPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}
  transform(url: string) {
    return url && url.startsWith('data:image/') ? this.sanitizer.bypassSecurityTrustUrl(url) : url;
  }
}

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
  thumbSrc?: IThumbSrc,

  // TODO: move to _calcImgSrcDim(options)
  targetWidth?: number,
  targetHeight?: number,
}

export interface IThumbSrc {
  width?:string;
  height?:string;
  src?: string;
  style?: {'width.px':string, 'height.px':string};
  title?: string;
  alt?: string;
  loading?: Promise<string>;
}

// update/extend interface definition
export interface IMappiGetLibraryOptions extends GetLibraryOptions {
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
  filePath?: string;        
  // imgCache?: {[dim:string]:string};
  // thumbSrc?: IThumbSrc;
  // TODO: determine if Subj/Observer with Async Pipe is performant
  // subj?: ReplaySubject<IThumbSrc>;
  // thumbSrc$?: Observable<IThumbSrc>;
  _photo?: IPhoto;
}

const PHOTO_LIBRARY_WAIT_LIMIT = 20;   // PhotoLibrary elements to load before returning

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  constructor(
    public dataService: MockDataService,
    private platform: Platform,
    private photoLibrary: PhotoLibrary,
  ) { 
    // reset caches, currently not put in Storage
    SubjectiveService.photoCache = {};
    PhotoLibraryHelper.reset();
    
    this.platform.ready().then( ()=>{
      if (typeof cordova != 'undefined')
        PhotoLibraryCordova = cordova.plugins['photoLibrary']; // ['photoLibrary'];
        window['_PhotoLibraryHelper'] = PhotoLibraryHelper;
    })    
  }

  // BUG: not working with exif time format
  static localTimeAsDate(localTime:string): Date {
    try {
      let dt:any = new Date(localTime);
      if (isNaN(dt) == false)
        return dt;
  
      // BUG: Safari does not parse time strings to Date correctly  
      const [,d,h,m,s] = localTime.match( /(.*)\s(\d*):(\d*):(\d*)\./)
      dt = new Date(d);
      dt.setHours(parseInt(h), parseInt(m), parseInt(s));
      // console.log(`localTimeAsDate=${dt.toISOString()}`)
      return dt;
    } catch (err) {
      console.warn("BUG: localTimeAsDate is not working properly")
      throw new Error(`Invalid localTime string, value=${localTime}`);
    }
  }

  /**
   * TODO: refactor to use the PhotoLibraryHelper.getThumbSrc$()
   * convert Plugin.Camera responses to be used with IMG.src
   * WKWebView does not allow loading 'file://' resources
   * @param imageData 
   * @param options 
   */
  getImgSrc_Camera(imageData, options):string{
    try {
      switch (options.destinationType) {
        case Camera.DestinationType.NATIVE_URI:
        case Camera.DestinationType.FILE_URL:
          const convertFileSrc = window['Ionic'].WebView.convertFileSrc;
          return convertFileSrc(imageData);
        case Camera.DestinationType.DATA_URL:
          // If it's base64 (DATA_URL):
          if (imageData.startsWith('data:image/')==false)
            return 'data:image/jpeg;base64,' + imageData;
          return imageData;
      }         
    } catch (err) {
      console.warn("setImgSrc():", err)
    }
  }




  /**
   * UI Helper functions for Components
   * INCOMPLETE
   * NOTE: scan_PhotoLibrary_Cordova is not exactly an implementation of choosePhoto...
   */
  async choosePhoto(seq?:number):Promise<IPhoto>{
    try {
      const device = await Device.getInfo();
      switch (device.platform){
        case 'ios':
          // use cordova-plugin-photo-library(mappi) with ios moments
          return this.load_PhotoLibraryByChunk()
          .then( (items)=>{
            const random = Date.now() % items.length;
            const photo = items[random]
            photo.seq = seq;
            console.log("Choosing random photo from PhotoLibrary, index=", random, photo.uuid);
            return photo;
          });
        case 'android':
          // use Camera
          const options = {
            targetWidth: Math.min(AppComponent.screenWidth, AppComponent.screenHeight)
          };
          const data = await this.getImage_Camera(options)
          return Promise.resolve(this._exif2Photo(data, null))
        case 'web':
          return this._getRandomPhoto(seq);
        default:
          return this._getRandomPhoto(seq);
      }
    } catch (err) {
        if (err=='continue')
          return this._getRandomPhoto(seq);
        return Promise.reject('continue');
    }
  }

  /**
   * entry point to prompt user to pick a photo
   * @param options 
   */
  async getImage_Camera(options:any={}):Promise<IExifPhoto>{
    const self = this;
    await this.platform.ready()
    return new Promise<IExifPhoto>( (resolve, reject)=>{ 
      const defaults:Camera.CameraOptions = {
        quality: 90,
        destinationType: Camera.DestinationType.FILE_URL,
        // destinationType: Camera.DestinationType.DATA_URL,
        sourceType: Camera.PictureSourceType.PHOTOLIBRARY,
        encodingType: Camera.EncodingType.JPEG,
        mediaType: Camera.MediaType.PICTURE,
        targetWidth: 320,
      }
      options = Object.assign({},defaults, options);
      options["plugin"] = "camera-with-exif";
      
      // HACK: workaround for typings fail
      const camera = navigator['camera'];
      camera.getPicture(
        (resp)=>resolve(resp), 
        (err)=>{
          console.warn("getImage_Camera()",err)
          reject(err);
        }, 
        options
      );
    })
    // NOTE: resp={filename, json_metadata} from "cordova-plugin-camera-with-exif"
    .then( resp=>this._cameraResp2Exif(resp, options) )
  }


  /**
   * cordova-plugin-photo-library (mappi) - with extra support for ios moments
   * see: https://github.com/mixuala/cordova-plugin-photo-library.git
   * 
   * NOTE: cordova-plugin-photo-library does NOT work through IonicNative.
   * use cordova.plugins.photoLibrary
   * @param options, options.parseItems:(items:LibraryItem[])=>void
   */
  async scan_PhotoLibrary_Cordova(callback?:(items:LibraryItem[])=>void
                                  , options?:any):Promise<LibraryItem[]>
  {

    const photolib_options:IMappiGetThumbnailOptions = { 
      thumbnailWidth: 80, 
      thumbnailHeight: 80,
      dataURL: true,
    };
    const lib_options:IMappiGetLibraryOptions = {
      thumbnailWidth: 80, 
      thumbnailHeight: 80,
      includeAlbumData: false,
      includeVideos: false,
      includeCloudData: false,
      itemsInChunk: 10, // Loading large library takes time, so output can be chunked so that result callback will be called on
      maxItems: 500,
      chunkTimeSec: 0.5,
      useOriginalFileNames: false,
    }
    Object.assign(lib_options, options);
    Object.assign(photolib_options, options);

    const items = await new Promise<LibraryItem[]>( (resolve,reject)=>{
      PhotoLibraryCordova.getLibrary( 
        async (chunk)=>{
          // await PhotoLibraryHelper.loadChunk(chunk.library, photolib_options);
          if (callback instanceof Function){
            // callback() uses Observer to monitor load, returns when enough are complete
            callback(chunk.library);
          } else {
            chunk.library.forEach( item=>{
              this.load_PhotoLibraryItem(item);
            })
          }
          if (chunk.isLastChunk){
            resolve(PhotoLibraryHelper.items());
          }
        },    
        (err)=>{
          console.log(err);
          reject(err);
        },
        lib_options
        );
    });

    return Promise.resolve(items);

    const moments = await new Promise<any[]>( (resolve,reject)=>{
      PhotoLibraryCordova.getMoments( 
        (moments)=>{
          console.log(">>> PhotoLibraryCordova.getMoments():", moments.slice(-5));
          resolve(moments);
        },    
        (err)=>{
          console.log(err);
          reject(err);
        },
        lib_options)
    });

    return Promise.resolve(items);
      
  }

  /**
   * LibraryItem => IPhoto pipeline:
   * - check if cached, IPhoto (from SubjectiveService.photoCache[uuid])
   * - check if cached, PhotoLibraryHelper.get() (from CameraRoll)
   * - _libraryResp2Exif)
   * - _exif2Photo()
   * - PhotoLibraryHelper.getThumbSrc$(itemData, thumbDim)
   * @param item 
   */
  load_PhotoLibraryItem(item:IMappiLibraryItem): IPhoto {
    const cachedItem = PhotoLibraryHelper.get(item.id);
    if (cachedItem && cachedItem._photo){
      // NOTE: when == Date.now() when loaded from CameraRoll into cache.
      const photo = SubjectiveService.photoCache[cachedItem._photo.uuid]; 
      // TODO: expire?, user may have edited?
      return photo;
    }

    const thumbDim = '80x80';
    const exifData = this._libraryResp2Exif(item);
    item._photo = this._exif2Photo(exifData, item, thumbDim);
    PhotoLibraryHelper.set(item);

    SubjectiveService.photoCache[item._photo.uuid] = item._photo;

    /**
     * TODO: use a BehaviorSubject to page LibraryItems for display. Do this in Component???
     */

    return item._photo;
  }

  load_PhotoLibraryByChunk():Promise<IPhoto[]>{
    let seq = 0;
    const waitForLimit = new BehaviorSubject<IPhoto[]>([]);
    const loaded:IPhoto[] = [];

    const scan_callback = (chunk:IMappiLibraryItem[]) =>{
      chunk.forEach( item=>{
        loaded.push( this.load_PhotoLibraryItem(item) );
      })
      seq += chunk.length;
      waitForLimit.next(loaded);
    }

    return new Promise<IPhoto[]>( (resolve, reject)=>{
      const done = waitForLimit.subscribe( loaded=>{
        if (loaded.length>PHOTO_LIBRARY_WAIT_LIMIT){
          done.unsubscribe();
          resolve( loaded );
        }
      })
      try {
        /**
         *  all set up, now start scanning
         * */        
        this.scan_PhotoLibrary_Cordova(scan_callback)
        .then ( (items)=>{
          if (items.length<=PHOTO_LIBRARY_WAIT_LIMIT){
            done.unsubscribe();
            const loaded = waitForLimit.value.slice();
            resolve( loaded );
          }
        })
      } catch (err){
        reject(err);
      }
    })
  }

  /**
   * PhotoLibrary not working with IonicNative at this moment
   */
  async scan_PhotoLibrary_IonicNative():Promise<Observable<LibraryItem[]>> {
    try {
      const photolib_options:IMappiGetThumbnailOptions = { 
        thumbnailWidth: 80, 
        thumbnailHeight: 80,
        dataURL: true,
      };
      await this.photoLibrary.requestAuthorization();
      const photolib = await this.photoLibrary.getLibrary(photolib_options);
      if (!photolib){
        console.warn("IonicNative PhotoLibrary: not available with this Device")
        return;
      }
      photolib.subscribe({
        next: library => {
          PhotoLibraryHelper.loadChunk(library, photolib_options);
        }
        , error: err => { console.log('could not get photos'); }
        , complete: () => { console.log('done getting photos'); }
      });
      return photolib;
    } catch (err) {
      console.warn("IonicNative PhotoLibrary: permissions weren\'t granted", err)
      return;
    }
  }



  /**
   * read jpeg data from NativeURI and get Exif metadata
   * @param item 
   * @param options 
   */
  private _libraryResp2Exif( item:IMappiLibraryItem, options?:any ): IExifPhoto {
    const self = this;
    function _getNativeURI(uri:string):string{
      return self.getImgSrc_Camera( uri, {destinationType: Camera.DestinationType.NATIVE_URI});
    }
    const exif = item['{Exif}'] || {};
    const gps = item['{GPS}'] || {};
    const tiff = item['{TIFF}'] || {};

    const exifData:IExifPhoto = {  
      

      // TODO: this src doesn't work
      src: _getNativeURI( 'file://'+item.filePath ),


      orientation: tiff['Orientation'] || item.orientation,
      exif: {
        DateTimeOriginal: exif['DateTimeOriginal'],
        PixelXDimension: item.width, 
        PixelYDimension: item.height,
      },       
      gps: {
        Altitude: gps['Altitude'],
        lat: gps['Latitude'],
        lng: gps['Longitude'],
        speed: gps['Speed'],
      },
      tiff: {
        Artist: tiff['Artist'],
        Copyright: tiff['Copyright'],
        Orientation: tiff['Orientation'],
      }
    }
    
    return exifData;
  }

  /**
   * parse Exif meta data from Camera.getPicture(FILE_URL) response
   * @param resp string Camera.DestinationType.FILE_URL
   * @param options 
   */
  private async _cameraResp2Exif( resp:any, options:Camera.CameraOptions ):Promise<IExifPhoto> {
    try {
      const device = await Device.getInfo();
      resp = JSON.parse(resp);
      const imageData = resp.filename;
      const metadata = JSON.parse(resp.json_metadata);
      
      if (metadata.GPS) {
        if (device.platform == 'ios') {
          // notice the difference in the properties below and the format of the result when you run the app.
          // iOS and Android return the exif and gps differently and I am not converting or accounting for the Lat/Lon reference.
          // This is simply the raw data being returned.
          metadata.GPS.lat = metadata.GPS.Latitude;
          metadata.GPS.lng = metadata.GPS.Longitude;
        } else {
          metadata.GPS.lat = metadata.gpsLatitude;
          metadata.GPS.lng = metadata.gpsLongitude;
        }    
      }
      const response = {
        src: this.getImgSrc_Camera(imageData, options),
        orientation:metadata['{TIFF}'] && metadata['{TIFF}'].Orientation || 1,
        exif: metadata.Exif || {},
        gps: metadata.GPS || {},
        tiff: metadata['{TIFF}'] || {},
      }
      Array.from(['targetWidth', 'targetHeight']).forEach( k=>{
        if (options[k]) response[k]=options[k];
      });
      return Promise.resolve(response);

    } catch(err) {
      console.error("parseExifFromResponse()", err);
      return Promise.reject(err);
    }
  }


  /**
   * convert cameraroll LibraryItem to IPhoto for rendering in <app-marker-item>, do NOT save to Rest API
   * @param exifData 
   * @param itemData 
   * @param thumbDim   optionally configure thumbSrc$ observer for thumbnails, e.g. 80x80 thumbnails 
   */
  private _exif2Photo(exifData:IExifPhoto, itemData?:IMappiLibraryItem, thumbDim:string='80x80'):IPhoto {
    const [imgW, imgH] = thumbDim.split('x');
    const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo', {seq:Date.now()});
    function _exifDate2ISO(s) {
      let parts = s.split(' ');
      return `${parts[0].replace(/\:/g,"-")}T${parts[1]}`;
    }

    function _calcImgSrcDim(p:IPhoto, target:{targetWidth?:number,targetHeight?:number}):{width:number,height:number}{
      const {width, height} = p;
      try {
        let {targetWidth, targetHeight } = target;
        if (width && height) {
          if (!targetWidth && targetHeight) {
            targetWidth = targetHeight*width/height;
          } else if (targetWidth && !targetHeight) {
            targetHeight = targetWidth*height/width;
          } else {
            throw new Error("do nothing");
          }
        }
        return {
          width: targetWidth,
          height: targetHeight,
        }
      } catch (err) {
        return {
          width: width,
          height: height,
        }  
      }
    }

    const exif:any = exifData.exif || {};
    const tiff:any = exifData.tiff || {};
    const gps:any = exifData.gps || {};
    const gpsLoc:[number,number] = gps.lat && gps.lng ? [gps.lat, gps.lng] : [0,0];
    let localTime:string;
    try {
      // localTime = PhotoService.localTimeAsDate( _exifDate2ISO(exif.DateTimeOriginal) ).toISOString();
      localTime = new Date( _exifDate2ISO(exif.DateTimeOriginal) ).toISOString();
    } catch (err) {
      localTime = null;
    }
    const pickFromExif = {
      src: exifData.src,                    // is this the correct IMG.src for the fullsize photo?
      dateTaken: localTime,
      orientation: tiff.Orientation || 1,
      loc: gpsLoc,
      width: exif.PixelXDimension,
      height: exif.PixelYDimension,
    }
    
    const pickFromItem = !itemData ? {} : {
      camerarollId: itemData.id,
      src: itemData.photoURL,               // override exifData.src
      loc: [itemData.latitude, itemData.longitude],
      label: itemData.fileName,
      dateTaken: itemData.creationDate,
      width: itemData.width,
      height: itemData.height,
      // cached values, do NOT save to Resty
      _thumbSrc: {
        width: imgW,
        height: imgH,
        style:  {'width.px':imgW, 'height.px':imgH},
        src:  null,
      },          
      _thumbSrc$: null,
    }
    const photo:IPhoto = Object.assign(emptyPhoto, pickFromExif, pickFromItem);
    // # final adjustments
    // photo._thumbSrc$ = thumbDim ? PhotoLibraryHelper.getThumbSrc$(photo, thumbDim) : null,
    photo.position = MappiMarker.position(photo);
    Array.from([null, 'thumbSrc']).forEach(o=>{
      PhotoLibraryHelper.rotateDimByOrientation(photo, o);
    })
    if (MappiMarker.hasLoc(photo)==false) photo["_loc_was_map_center"] = true;

    console.log(`>>> PhotoLibraryHelper:IPhoto, id=${photo.camerarollId} `, photo.src, itemData.fileName);
    return photo;
  }

  private _getRandomPhoto(seq:number):Promise<IPhoto> {
    return this.dataService.Photos.get()
    .then(photos => {
      // create placeholder mi derived from a random photo
      const random = {
        i: Date.now() % photos.length,
        locOffset: [Math.random(), Math.random()].map(v => (v - 0.5) / 60),
      }
      
      let data = {
        dateTaken: new Date().toISOString(),
        locOffset: random.locOffset,       // randomize location
      };  
      data = Object.assign({}, photos[random.i], data);
      // create a new photo by modifying attrs of a random clone
      const p = RestyTrnHelper.getPlaceholder('Photo', data);
      p.position = MappiMarker.position(p);
      p.loc = [p.position.lat, p.position.lng];
      p.locOffset = [0,0];
      MockDataService.inflatePhoto(p, seq);
      return p;
    })
  }

}
















/**
 * cache dataURLs from cordova-plugin-photo-library (mappi)
 */

export class PhotoLibraryHelper {
  // private static _cache:{[uuid:string]:IMappiLibraryItem | Promise<IMappiLibraryItem>} = {};
  private static _cache:{ [uuid:string]:IMappiLibraryItem } = {};
  static reset(){ PhotoLibraryHelper._cache = {} }
  static get(uuid:string):IMappiLibraryItem { return PhotoLibraryHelper._cache[uuid] }
  static set(item:IMappiLibraryItem):IMappiLibraryItem { return PhotoLibraryHelper._cache[item.id] = item }
  static items():IMappiLibraryItem[] {
    return Object.values(PhotoLibraryHelper._cache);
  }

  static getEmptyThumbSrc(dim:string='80x80'):IThumbSrc {
    const [imgW, imgH] = dim.split('x');
    return {
      width: imgW,
      height: imgH,
      src: null,
      style: {'width.px':imgW, 'height.px':imgH},
    }
  }

  /**
   * WARNING: this method mutates p
   * @param p 
   * @param key 
   * @returns true if object p was changed
   */
  static rotateDimByOrientation(p:IPhoto, key?:string):boolean{
    const target = key ? p[key] : p;
    if (target && p.orientation > 4){
      const {width, height} = target;
      target.width = height;
      target.height = width;
      return true;
    }
    return false;
  }

  static loadChunk(library:IMappiLibraryItem[], options:GetLibraryOptions):void {
    library.forEach( (libraryItem)=> {
      if (PhotoLibraryHelper._cache[libraryItem.id]) return;
      console.log(`>>> PhotoLibraryHelper.loadChunk(${library.length})`,libraryItem.id, libraryItem.photoURL);
    });
  };


  /**
   * 
   * lazyload IMG.src from IPhoto. only fetch dataURLs when called.
   * 
   * use with: <app-mappi-image [photo]="photo"></app-mappi-image>
   * 
   * @param photo 
   * @param dim
   * @returns IThumbSrc, res !== photo._thumbSrc when src CHANGED
   */
  static lazySrc( photo:IPhoto, dim:string='80x80'):IThumbSrc{
    const [imgW, imgH] = dim.split('x');
    const cached = SubjectiveService.photoCache[photo.uuid];
    const emptyThumbSrc = PhotoLibraryHelper.getEmptyThumbSrc();

    // init defaults
    photo._thumbSrc = photo._thumbSrc || emptyThumbSrc;
    photo._imgCache = photo._imgCache || {};

    emptyThumbSrc['when'] = parseInt((Math.random()+"").slice(-3));

    if (cached && cached._imgCache && cached._imgCache[dim]){
      // assume all Storage.get() photos are restored && cached
      if (cached._imgCache[dim] === photo._thumbSrc.src){
        console.log(" --- 1. no change, same as cached value ---", emptyThumbSrc['when']);
        return photo._thumbSrc; // return same value, avoid changeDetection
      }

      // use immutable value for changeDetection
      emptyThumbSrc.src = cached._imgCache[dim];
      return emptyThumbSrc;
    }

    SubjectiveService.photoCache[photo.uuid] = photo;

    if (photo.camerarollId){
      if (photo._thumbSrc['loading']) {
        console.log(" --- 3. no change, waiting on Promise ---", emptyThumbSrc['when']);
        return photo._thumbSrc;
      }  
      // load dataURL from cameraroll using use PhotoLibrary.getThumbnail( {dataURL:true})
      // cache value and return
      const options = { 
        thumbnailWidth: parseInt(imgW), 
        thumbnailHeight: parseInt(imgH),
        dataURL: true,
      }
      photo._thumbSrc['loading'] = PhotoLibraryHelper.getDataURLFromCameraRoll(photo, options)
      .then( imgSrc=>{
        // use immutable value for changeDetection
        emptyThumbSrc.src = photo._imgCache[dim] = imgSrc;
        console.warn(`@@@ cameraroll CHANGED src.length=${imgSrc.length}, `, photo.uuid,  imgSrc && imgSrc.slice(0,25));
        return imgSrc; // resolve
      });
      // return same value, avoid changeDetection until ready
      console.log(" --- 2. no change, init Promise ---", emptyThumbSrc['when']);  
      photo._thumbSrc['when'] = Date.now()
      return photo._thumbSrc;  
    } 
    else {
      // photo in cloud, but not cached, fetch src with proper size spec
      const _getSrcUrlBySize = (photo:IPhoto, dim:string='80x80'):string => {
        // only works for demo data on https://picsum.photos
        return photo.src.replace(/\d+\/\d+/, dim.replace('x','/'));
      }
      emptyThumbSrc.src = photo._imgCache[dim] = _getSrcUrlBySize(photo, dim);
      // use immutable value for changeDetection
      return emptyThumbSrc;
    }
  }

  static getDataURLFromCameraRoll(photo:IPhoto, options:IMappiGetThumbnailOptions):Promise<string> {
    const dim = options['dim'] || '80x80';
    return new Promise( (resolve, reject)=>{
      if (photo.camerarollId=="fake"){
        setTimeout( ()=>{
          console.warn(  "@@ >> fake CameraRoll delay for id=", photo.uuid)
          const src = photo.src.replace(/\d+\/\d+/, dim.replace('x','/'))
          resolve(  src  );
        },100)
        return "fake cameraroll delay"
      }
      options.dataURL = true;
      PhotoLibraryCordova.getThumbnail(
        photo.camerarollId,
        (data:Blob|string, mimeType:string) => {
          if (data instanceof Blob){
            const errMsg = "PhotoLibraryHelper._assignDataURL() not configured for Blob data yet";
            console.error(errMsg);
            reject(errMsg);
          } else 
            resolve(  data  );
        },
        function (err) {
          console.log('PhotoLibraryHelper._assignDataURL(): Error occured', err);
          reject(err);
        },
        options);
    })
  }
}
