import { ChangeDetectorRef, Injectable, Pipe, PipeTransform, } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Platform } from '@ionic/angular';
import { Observable, ReplaySubject, BehaviorSubject } from 'rxjs';

import { Plugins } from '@capacitor/core';
import * as Camera from '@ionic-native/camera/ngx';
import { PhotoLibrary, LibraryItem, GetLibraryOptions, GetThumbnailOptions } from '@ionic-native/photo-library/ngx';
import { WebView } from '@ionic-native/ionic-webview/ngx';

import { AppComponent } from '../../app.component';
import { MockDataService, RestyTrnHelper, IMarker, IPhoto, quickUuid } from '../mock-data.service';
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
  exif?: {
    DateTimeOriginal: string,
    PixelXDimension: number,
    PixelYDimension: number,
    [propName:string]: any,
  },
  gps?: {
    lat: number,
    lng: number,
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
  width?:number;
  height?:number;
  src?: string;
  style?: {'width.px':string, 'height.px':string}; 
}

export interface IMappiGetThumbnailOptions extends GetThumbnailOptions {
  dataURL: boolean;
  maxItems?: number;
}

export interface IMappiLibraryItem extends LibraryItem {
  // e.g. "/Users/[...]/Devices/A11DA2A5-D033-40AA-BEE1-E2AA8281B774/data/Media/DCIM/100APPLE/IMG_0004.JPG"
  filePath?: string;        
  imgCache?: {[dim:string]:string};
  thumbSrc?: IThumbSrc;
  // TODO: determine if Subj/Observer with Async Pipe is performant
  subj?: ReplaySubject<IThumbSrc>;
  thumbSrc$?: Observable<IThumbSrc>;
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
    this.platform.ready().then( ()=>{
      if (typeof cordova != 'undefined')
        PhotoLibraryCordova = cordova.plugins['photoLibrary']; // ['photoLibrary'];
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
          return this.load_PhotoLibrary()
          .then( (items)=>{
            const random = Date.now() % items.length;
            const photo = items[random]
            photo.seq = seq;
            console.log("Choosing random photo from PhotoLibrary, index=", random, photo);
            return photo;
          });
        case 'android':
          // use Camera
          const options = {
            targetWidth: Math.min(AppComponent.screenWidth, AppComponent.screenHeight)
          };
          const data = await this.getImage_Camera(options)
          return Promise.resolve(this._exif2Photo(data, null, seq))
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



  getImage_Library(items: IMappiLibraryItem[], seq:number, options:any={}):Promise<IExifPhoto>{
    // const items = await this.scan_PhotoLibrary_Cordova();
    const key = '80x80';
    const item = items[seq];
    const pr_exifData = this._libraryResp2Exif(item);
    const pr_thumbSrc = new Promise<IThumbSrc>( (resolve, reject)=>{
      const done = PhotoLibraryHelper.getThumbSrc$(item, key)
      .subscribe( (thumbSrc)=>{
        done.unsubscribe();
        // TODO: mutates item, change obj reference if you don't use Observer
        resolve(thumbSrc);
      })
    })
    return Promise.all([pr_exifData, pr_thumbSrc])
    .then ( resp=>{
      console.log("getImage_Library()", item)
      return Promise.resolve(resp[0]);
    })
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
    const lib_options:GetLibraryOptions = {
      maxItems: 100
    }
    Object.assign(lib_options, options);
    Object.assign(photolib_options, options);

    const items = await new Promise<LibraryItem[]>( (resolve,reject)=>{
      PhotoLibraryCordova.getLibrary( 
        async (chunk)=>{
          await PhotoLibraryHelper.loadChunk(chunk.library, photolib_options);
          if (callback instanceof Function){
            callback(chunk.library)
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
    })

    const moments = await new Promise<any[]>( (resolve,reject)=>{
      PhotoLibraryCordova.getMoments( 
        (moments)=>{
          console.log("PhotoLibraryCordova.getMoments():", moments);
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

  load_PhotoLibrary():Promise<IPhoto[]>{
    let seq = 0;
    const waitForLimit = new BehaviorSubject<Promise<IPhoto>[]>([]);
    const scan_callback = (chunk:LibraryItem[]) =>{
      // 'inflate' IPhoto here
      const pr = chunk.map( (item, i)=>{
        return this.getImage_Library(chunk, seq+i)
        .then( exifData=>{
          return this._exif2Photo(exifData, item, seq+i);
        })
        .then( exifData=>{
          return this._exif2Photo(exifData, item, seq+i);
        })
      });
      seq += chunk.length;
      const waitingFor = waitForLimit.value.slice();
      pr.forEach( o=>waitingFor.push(o) );
      waitForLimit.next(waitingFor);
    }
    return new Promise<IPhoto[]>( (resolve, reject)=>{
      const _haveEnough = ( waitFor:Promise<IPhoto>[])=>{
        Promise.all(  waitFor )
        .then( items=>{
          console.log("*** ChoosePhoto from PhotoLibrary, items=", items)

          // HACK: just choose the last item
          resolve(items);
        });
      }
      const done = waitForLimit.subscribe( waitFor=>{
        if (waitFor.length>PHOTO_LIBRARY_WAIT_LIMIT){
          done.unsubscribe();
          _haveEnough(waitFor)
        }
      })
      try {
        // all set up, now start scanning
        this.scan_PhotoLibrary_Cordova(scan_callback)
        .then ( (items)=>{
          if (items.length<=PHOTO_LIBRARY_WAIT_LIMIT){
            done.unsubscribe();
            _haveEnough(waitForLimit.value);
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
  private async _libraryResp2Exif( item:IMappiLibraryItem, options?:any ):Promise<IExifPhoto> {
    console.warn("_libraryResp2Exif NOT implemented yet" );
    const self = this;
    function _getNativeURI(uri:string):string{
      return self.getImgSrc_Camera( uri, {destinationType: Camera.DestinationType.NATIVE_URI});
    }
    function _getExifFromJpeg(nativeURI:string):any {
      return {  
        
        
        /* TODO:  get metadata */
        src: nativeURI,
        exif: {
          PixelXDimension: item.width, 
          PixelYDimension: item.height,
        },
        gps: {},
        tiff: {}
      
      
      
      };
    }
    const nativeURI = _getNativeURI( 'file://'+item.filePath );
    const metaData = _getExifFromJpeg(nativeURI);
    // metaData.src = item.photoURL;  // `cdvphotolibrary://`
    
    return Promise.resolve(metaData as IExifPhoto);
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
   * WARNING: this method mutates p
   * @param p 
   * @param key 
   * @returns true if object p was changed
   */
  private _rotateDim(p:IPhoto, key?:string):boolean{
    const target = p[key];
    if (target && p.orientation > 4){
      const {width, height} = target;
      target.width = height;
      target.height = width;
      return true;
    }
    return false;
  }

  /**
   * NOTE: call AFTER exif and thumbSrc are valid so _rotateDim() can 
   * work on thumbSrc using tiff.Orientation value
   * @param exifData 
   * @param itemData 
   * @param seq 
   */
  private _exif2Photo(exifData:IExifPhoto, itemData?:IMappiLibraryItem, seq?:number):IPhoto{
    const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo');
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
      dateTaken: localTime,
      orientation: tiff.Orientation || 1,
      src: exifData.src,
      loc: gpsLoc,
      width: exif.PixelXDimension,
      height: exif.PixelYDimension,
      seq: seq,
    }
    const pickFromItem = !itemData ? {} : {
      loc: [itemData.latitude, itemData.longitude],
      label: itemData.fileName,
      dateTaken: itemData.creationDate,
      // src: itemData.photoURL,
      width: itemData.width,
      height: itemData.height,
      thumbSrc: itemData.thumbSrc,
    }
    const p:IPhoto = Object.assign(emptyPhoto, pickFromExif, pickFromItem);
    p.position = MappiMarker.position(p);

    // # final adjustments
    Array.from([null, 'image', 'thumbSrc']).forEach(o=>{
      this._rotateDim(p, o);
    })
    // p.thumbSrc$ = PhotoLibraryHelper.getThumbSrc$(itemData, '80x80');
    if (!MappiMarker.hasLoc(p)) p["_loc_was_map_center"] = true;


    return p;
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
  // cache dataURLs, e.g. PLH.library = { [uuid]:{ '80x80':[dataURL] } }
  static cache:{[uuid:string]:LibraryItem} = {};
  static libraryItems:LibraryItem[] = [];
  static loadChunk(library:LibraryItem[], options:GetLibraryOptions):void {
    library.forEach( (libraryItem)=> {
      PhotoLibraryHelper.cache[libraryItem.id] = libraryItem;
      console.log(libraryItem.id, libraryItem);
    });
  };
  static items():LibraryItem[] {
    return Object.values(PhotoLibraryHelper.cache);
  }

  /**
   * 
   * @param libraryItem 
   * @param key 
   * @returns {} or valid IThumbSrc
   */
  static getThumbSrc$(libraryItem:IMappiLibraryItem, key:string):Observable<IThumbSrc> {
    // const dim = [photolib_options.thumbnailWidth, photolib_options.thumbnailHeight];
    const [imgW, imgH] = key.split('x');
    const subj = libraryItem.subj ? libraryItem.subj : new ReplaySubject(1);

    // initialize
    if (!libraryItem.subj){
      libraryItem.subj = subj;
      libraryItem.thumbSrc$ = subj as Observable<IThumbSrc>;
      libraryItem.imgCache = {};
    }

    // return cached value
    if (libraryItem.imgCache[key])
      return libraryItem.thumbSrc$
    
    // cache value and return
    const options = { 
      thumbnailWidth: parseInt(imgW), 
      thumbnailHeight: parseInt(imgH),
      dataURL: true,
    }
    PhotoLibraryHelper._assignDataURL(libraryItem, options)
    .then( ()=>{
      const thumbSrc:IThumbSrc = {
        width:parseInt(imgW),
        height:parseInt(imgH),
        src: libraryItem.imgCache[key],
        style: {'width.px':imgW, 'height.px':imgH},  
      }
      libraryItem.thumbSrc = thumbSrc
      libraryItem.subj.next( libraryItem.thumbSrc );
    })
    return libraryItem.thumbSrc$
  }

  private static _assignDataURL(libraryItem:IMappiLibraryItem, options:IMappiGetThumbnailOptions):Promise<IMappiLibraryItem> {
    const self = this;
    libraryItem.imgCache = libraryItem.imgCache || {};
    return new Promise( (resolve, reject)=>{
      PhotoLibraryCordova.getThumbnail(
        libraryItem, // or libraryItem.id
        (data:Blob|string, mimeType:string) => {
          const dim = [options.thumbnailWidth, options.thumbnailHeight];
          const key = dim.join('x');
          if (options.dataURL){
            libraryItem.imgCache[key] = data as string;
          }
          else {
            console.error("PhotoLibraryHelper._assignDataURL() not configured for Blob data yet");
            // libraryItem.thumbnailSrc[key] = data; // btoa()
          }
          resolve(libraryItem);
        },
        function (err) {
          console.log('PhotoLibraryHelper._assignDataURL(): Error occured', err);
          reject(err);
        },
        options);
    })
  }
}
