import { Injectable, } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Observable, BehaviorSubject } from 'rxjs';

import * as Camera from '@ionic-native/camera/ngx';
import { PhotoLibrary, LibraryItem, AlbumItem, GetLibraryOptions, GetThumbnailOptions } from '@ionic-native/photo-library/ngx';

import { 
  IPhoto, 
  IMoment, IExifPhoto, IMappiLibraryItem, IMappiGetLibraryOptions, IMappiGetThumbnailOptions, IChoosePhotoOptions,
} from '../types'
import { AppConfig, ScreenDim } from '../helpers';
import { MockDataService, RestyTrnHelper } from '../mock-data.service';
import { MappiMarker } from '../mappi/mappi.service';
import { AppCache } from '../appcache';

// import * as PhotoLibraryCordova from '../../../../node_modules/cordova-plugin-photo-library/PhotoLibrary';

let PhotoLibraryCordova:any = null;


const PHOTO_LIBRARY_WAIT_LIMIT = 100;   // PhotoLibrary elements to load before returning

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  constructor(
    public dataService: MockDataService,
    private platform: Platform,
    private photoLibrary: PhotoLibrary,
  ) {

    this.platform.ready().then(async () => {
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
   * WKWebView does not allow loading 'cdvphotolibrary://' resources
   * see: 
   * - https://github.com/terikon/cordova-plugin-photo-library/issues/103
   * - https://github.com/terikon/cordova-plugin-photo-library/issues/41
   * 
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
   */


  /**
   * Cameraroll: IMappiLibraryItem => IPhoto pipeline
   *  - choosePhoto():                          Promise<IPhoto>
   *  - choosePhoto_Provider():                 Promise<IPhoto>
   *    - scan_moments_PhotoLibrary_Cordova():    Promise<LibraryItem[]>
   *      - AppCache.for('Cameraroll').set(item)
   *    - items.map (item)=>                      IPhoto[]
   *        - const exifData = this._libraryResp2Exif(item);
            - photo = this._exif2Photo(exifData, item);
   *    - _pickRandomPhoto( photos )              IPhoto
   *    - AppCache.for('Photo').set(photo)        
   *    - Promise.resolve(photo)                Promise<IPhoto>
   */


  // INCOMPLETE
  async getCamerarollAsPhotos(options:any={}):Promise<IPhoto[]>{
    // TODO: when do we update cache?
    let items:IMappiLibraryItem[] = AppCache.for('Cameraroll').items();

    // filter bounds/dateTaken
    if (options.from || options.to) {
      // filter by dateTaken
    }
    if (options.bounds) {
      // filter by bounds
    }

    // convert to IPhoto for display
    const photos = items.map( item=>{
      return PhotoLibraryHelper.libraryItem2Photo(item, true);
    });
    return Promise.resolve(photos);
  }

  /**
   * 
   * @param seq 
   * @param options 
   */
  async choosePhoto(seq?:number, options:IChoosePhotoOptions={}):Promise<IPhoto>{
    let { moments, positions, bounds, provider, except } = options;
    let itemCount;
    if (moments && moments.length) {
      itemCount = moments.reduce( (res,m)=>res.concat(m.itemIds),[])
      if (except && except.length) itemCount = itemCount.filter(v=>!except.includes(v));
    }
    try {
      switch (AppConfig.device.platform){
        case 'ios':
          if (provider)
            return this.choosePhoto_Provider( provider, seq , options);
          else if (bounds || positions )
            return this.choosePhoto_Provider("Bounds", seq , options);
          else if (moments && itemCount>10)
            return this.choosePhoto_Provider("Moments", seq , options);
          else
            return this.choosePhoto_Provider('Camera', seq); 
        case 'android':
          return this.choosePhoto_Provider('Camera', seq);
        case 'web':
        default:
          return this.choosePhoto_Provider('Picsum', seq);
      }
    } catch (err) {
        if (err=='continue')
          return this._getRandomPhoto(seq);
        return Promise.reject('continue');
    }
  }

  async choosePhoto_Provider(provider:string, seq?:number, options:IChoosePhotoOptions={} ):Promise<IPhoto>{
    let { moments, positions, bounds, except } = options;
    let photo:IPhoto;
    let item:IMappiLibraryItem;
    const LOAD_LIMIT = 4000;  // DEV: demo only
    if (AppConfig.device.platform != 'ios')     provider = "Picsum";

    switch(provider){
      case "Bounds":
        let items = AppCache.for('Cameraroll').items();
        if (items.length < LOAD_LIMIT) {
          // await this.load_PhotoLibraryByChunk(LOAD_LIMIT, 400);
          items = AppCache.for('Cameraroll').items();
        }

        const filterBounds:google.maps.LatLngBounds = bounds || new google.maps.LatLngBounds(null);
        let pickFrom:IMappiLibraryItem[] = [];
        items = items.filter(v=>!except.includes(v.id));

        if (filterBounds==bounds){
          // prefer map bounds over marker bounds
          pickFrom = items.filter( item=>filterBounds.contains( 
            new google.maps.LatLng(item.latitude, item.longitude) 
            ));
        }  
        if (pickFrom.length==0 && positions) {
          // try again after extending bounds by marker positions
          positions.forEach( p=>filterBounds.extend(new google.maps.LatLng(p.lat, p.lng)));
          pickFrom = items.filter( item=>filterBounds.contains( 
            new google.maps.LatLng(item.latitude, item.longitude) 
            ));
        }
        if (!pickFrom.length){
          console.warn("### choosePhoto_Provider:Bounds, item not in map bounds", bounds);
          return this.choosePhoto_Provider('Camera', seq);
        }
        photo = this._pickRandomPhotoItemFavorite( null, pickFrom );        
        AppCache.for('Photo').set(photo);   // cache picked photo with unique p.uuid
        return Promise.resolve( photo );
        
      case "Moments":
        // use cordova-plugin-photo-library(mappi) with ios moment
        // let m = await this.scan_moments_PhotoLibrary_Cordova({daysAgo:90})
        let [moment, checkItem] = this._pickRandomMomentAndItem(moments, except);
        if ( typeof checkItem == 'string') {
          // moment not found, cache more items
          // await this.load_PhotoLibraryByChunk(LOAD_LIMIT, 300);
          item = AppCache.for('Cameraroll').get(checkItem) as IMappiLibraryItem
          
          if (!item) {
            console.warn("### choosePhoto_Provider:Moments, item not in cache ", moment);
            return this.choosePhoto_Provider('Camera', seq);
          }
          // found valid moment and item
        } else item = checkItem;
        AppCache.for('Moment').set(moment, item.id);  // back ref
        photo = PhotoLibraryHelper.libraryItem2Photo(item, true);
        photo.seq = seq;
        return Promise.resolve( photo );
        // continue
      case "RandomCameraRoll":
        // use cordova-plugin-photo-library(mappi)
        return Promise.resolve(true)
        .then( ()=>{
          const items = AppCache.for('Cameraroll').items();
          if (items.length > PHOTO_LIBRARY_WAIT_LIMIT) {
            // TODO: cant load more items INCREMENTALLY until we add a {from: to:} option
            if (items.length < LOAD_LIMIT) {
              // const nowait = this.load_PhotoLibraryByChunk(LOAD_LIMIT);
            }
          }
        })
        .then( ()=>{
          const items = AppCache.for('Cameraroll').items();
          photo = this._pickRandomPhotoItemFavorite( null, items );
          AppCache.for('Photo').set(photo);   // cache picked photo with unique p.uuid
          return Promise.resolve( photo );
        });
      case "Camera":
        // use Camera
        const [fitW,fitH] = await ScreenDim.getWxH();
        const options = {
          targetWidth: Math.min(fitW, fitH)
        };
        const exifData = await this.getImage_Camera(options);
        // WARNING: not using PhotoLibrary, so no direct access to moments
        // check if item is cached by matching exif.DateTimeOriginal
        item = AppCache.findItemByFingerprint(exifData);
        photo = PhotoLibraryHelper._exif2Photo(exifData, item);
        AppCache.for('Photo').set(photo);   // cache picked photo with unique p.uuid
        if (photo.camerarollId) {
          moment = AppCache.findMomentByItemId(photo.camerarollId);
          if (moment)
            AppCache.for('Moment').set( moment, photo.camerarollId);   // cache moment back ref
        }
        return Promise.resolve( photo );
      case "Picsum":
      default:
        return this._getRandomPhoto(seq);
    }
  }

  _findFavorites(ids:string[]):IMappiLibraryItem[]{
    const favorites:IMappiLibraryItem[] = ids.reduce( (res:IMappiLibraryItem[], key)=>{
      const found:IMappiLibraryItem = AppCache.for('Cameraroll').get(key);
      if (found && found.isFavorite) res.push(found);
      return res;
    },[]);
    return favorites;
  }

  _pickRandomPhotoItemFavorite(photos:IPhoto[], items?:IMappiLibraryItem[], attempts:number=5):IPhoto{
    let pickFrom = photos ? photos : items;
    let favorites;
    if (!pickFrom) return;
    if (pickFrom == photos){
      favorites = this._findFavorites(photos.map(o=>o.camerarollId));
      pickFrom = favorites.length ? favorites : photos;
    } else {
      favorites = items.filter(o=>!!o.isFavorite);
      pickFrom = favorites.length ? favorites : items;
    }
    /**
     * choose a random photo from cameraroll, prefer one with GPS loc
     */
    let pick;
    let hasLoc:boolean;
    do {
      attempts--;
      let random = Math.floor(Math.random() * pickFrom.length);
      pick = pickFrom[random];
      hasLoc = pick.hasOwnProperty('latitude') || MappiMarker.hasLoc(pick);
    }
    while (hasLoc==false && attempts > 0);
    if (pick.hasOwnProperty('camerarollId')) {
      return pick as IPhoto;
    }
    return PhotoLibraryHelper.libraryItem2Photo(pick as IMappiLibraryItem, true);
  };

  _pickRandomMomentAndItem(moments:IMoment[], except:string[]=[], attempts:number=5):[IMoment, IMappiLibraryItem |string]{
    if (moments.length==0) return [null,null];
    let itemIds:string[] = moments.reduce( (res,m)=>res.concat(m.itemIds),[]);
    itemIds = itemIds.filter(v=>!except.includes(v));
    const favorites = this._findFavorites(itemIds);
    const pickFrom = favorites.length ? favorites : itemIds;
    let pick;
    let hasLoc:boolean;
    do {
      attempts--;
      let random = Math.floor(Math.random() * pickFrom.length);
      pick = pickFrom[random];
      if (typeof pick == 'string') 
        pick = AppCache.for('Cameraroll').get(pick) as IMappiLibraryItem;
      hasLoc = pick && pick.hasOwnProperty('latitude');
    }
    while (hasLoc==false && attempts > 0);
    const moment = moments.find(m=>m.itemIds.includes(pick.id));
    return [moment, (pick as IMappiLibraryItem) ];
  };


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
   * 
   * saves to Storage after lastChunk==true
   * - Storage:         AppCache.storeByClassName('Cameraroll')
   * 
   * @param options, options.parseItems:(items:LibraryItem[])=>void
   */
  async scan_PhotoLibrary_Cordova(callback?:(items:LibraryItem[])=>void
                                  , options:any={}):Promise<LibraryItem[]>
  {
    const photolib_options:IMappiGetThumbnailOptions = { 
      thumbnailWidth: 80, 
      thumbnailHeight: 80,
      dataURL: true,
    };
    const lib_options:IMappiGetLibraryOptions = {
      // itemIds:[],          // TODO: fetch by LibraryItem.ids
      thumbnailWidth: 80, 
      thumbnailHeight: 80,
      includeAlbumData: false,
      includeVideos: false,
      includeCloudData: false,
      
      // Loading large library takes time, so output can be chunked so that result callback will be called on
      // chose 1 from below
      chunkTimeSec: 0.3,      
      // itemsInChunk: 100,

      maxItems: 500,
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
          } else { // no callback
            chunk.library.forEach( item=>{
              AppCache.for('Cameraroll').set(item);
            })
          }
          if (chunk.isLastChunk){
            console.log(`("#### PhotoLibraryCordova.getLibrary(): reached last chunk`);
          
            AppCache.storeByClassName('Cameraroll');
            resolve(AppCache.for('Cameraroll').items());
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
      
  }

  /**
   * scan Cameraroll for Moments (ios), also calls
   * - runtime cache:   AppCache.for('Moment').set(m)
   * - Storage:         AppCache.storeByClassName('Moment')
   * @param options 
   */
  async scan_moments_PhotoLibrary_Cordova(options: any = {}): Promise<IMoment[]> {
    function _daysAgo(n: number): Date {
      return new Date(Date.now() - 24 * 3600 * 1000 * n);
    }
    async function _getCenter(moment: IMoment): Promise<[number, number]> {
      const bounds = new google.maps.LatLngBounds(null);
      moment.itemIds.forEach(async (uuid) => {
        let found: IPhoto | IMappiLibraryItem;
        found = AppCache.for('Cameraroll').get(uuid);
        if (!found) found = AppCache.for('Photo').items().find(o => o.camerarollId == uuid);
        if (!found) {
          console.warn("TODO: load itemId from cameraRoll")
          return;
        }
        const lat = (found['{GPS}'] && found['{GPS}'].Latitude) || (found['loc'] && found['loc'][0]) || null;
        const lng = (found['{GPS}'] && found['{GPS}'].Longitude) || (found['loc'] && found['loc'][1]) || null;
        if (lat && lng) bounds.extend(new google.maps.LatLng(lat, lng));
      })
      return MappiMarker.getBoundsLoc(bounds);
    }

    const cached:IMoment[] = AppCache.for('Moment').items();
    if (cached.length) {
      // TODO: check date range
      console.warn(`###Cameraroll Moments, SKIP SCAN. count=${cached.length}`, JSON.stringify(options), cached);
      return Promise.resolve(  cached  );
    }

    let {from, to, daysAgo} = options;
    const HOW_MANY_DAYS_AGO = 90;
    if (!from && !to) options.from = _daysAgo(daysAgo || HOW_MANY_DAYS_AGO).toISOString();
    const added = [];
    return new Promise<IMoment[]>( (resolve,reject)=>{
      PhotoLibraryCordova.getMoments( 
        async (moments)=>{
          await moments.forEach( async (m,i,l)=>{
            const found = AppCache.for('Moment').get(m.id);
            if (!found) added.push(m);
            await _getCenter(m).then( loc=>{
              m.loc = loc;
            });
            AppCache.for('Moment').set(m);  // update cached value regardless
          });
          AppCache.storeByClassName('Moment'); // save to Storage
          console.log(`###Cameraroll Moments, count=${moments.length}, new=${added.length}`, JSON.stringify(options), added)
          resolve(moments);
        },    
        (err)=>{
          console.log(err);
          reject(err);
        },
        options)
    });
  }

  /**
   * load Cameraroll, calls:
   * - runtime cache:   AppCache.for('Cameraroll').set(m)
   * - Storage:         AppCache.storeByClassName('Cameraroll') from scan_PhotoLibrary_Cordova()
   * @param limit 
   * @param waitLimit 
   */
  load_PhotoLibraryByChunk(limit?:number, waitLimit:number=PHOTO_LIBRARY_WAIT_LIMIT):Promise<IMappiLibraryItem[]>{
    let seq = 0;
    const waitForLimit = new BehaviorSubject<IMappiLibraryItem[]>([]);
    const loaded:IMappiLibraryItem[] = [];
    const cached = AppCache.for('Cameraroll').items();
    if (cached.length >= limit) {
      // check to see how many we loaded from Storage
      // NOTE: Cameraroll data is dynamic and we might need to reload, even if found in Storage
      console.log("### PhotoLibrary scan CANCELLED, cache count=", AppCache.for('Cameraroll').items().length);
      return Promise.resolve(cached);
    }
    const scan_callback = (chunk:IMappiLibraryItem[])=>{
      chunk.forEach( item=>{
        AppCache.for('Cameraroll').set(item);
        loaded.push( item );
      })
      seq += chunk.length;
      waitForLimit.next(loaded);
      console.log("### PhotoLibrary scan, cache count=", AppCache.for('Cameraroll').items().length);
    }
    // const maxItems = cached.length + limit;
    const maxItems = limit;
    const lib_options = limit ? { maxItems } : {};
    return new Promise<IMappiLibraryItem[]>( (resolve, reject)=>{

      const done = waitForLimit.subscribe( loaded=>{
        if (loaded.length>waitLimit){
          done.unsubscribe();
          resolve( loaded ); 
        }
      });

      try {
        /**
         *  all set up, now start scanning
         * */        
        this.scan_PhotoLibrary_Cordova(scan_callback, lib_options)
        .then ( (items)=>{

          if (items.length<=waitLimit){
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
      await this.photoLibrary.requestAuthorization({read:true,write:true});
      const photolib = await this.photoLibrary.getLibrary(photolib_options);
      if (!photolib){
        console.warn("IonicNative PhotoLibrary: not available with this Device")
        return;
      }
      photolib.subscribe({
        next: library => {
          library.forEach( (item)=> {
            AppCache.for('Cameraroll').set(item);
            // this.load_PhotoLibraryItem(item);
          });
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
   * parse Exif meta data from Camera.getPicture(FILE_URL) response
   * @param resp string Camera.DestinationType.FILE_URL
   * @param options 
   */
  private async _cameraResp2Exif( resp:any, options:Camera.CameraOptions ):Promise<IExifPhoto> {
    try {
      resp = JSON.parse(resp);
      const imageData = resp.filename;
      const metadata = JSON.parse(resp.json_metadata);
      
      if (metadata.GPS) {
        if (AppConfig.device.platform == 'ios') {
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
 * 
 * cache dataURLs from cameraroll using cordova-plugin-photo-library (mappi)
 * 
 */


export class PhotoLibraryHelper {
  static loadCamerarollFromCache():Promise<any[]> {
    return Promise.all( [
      AppCache.loadByClassName('Cameraroll') 
      , AppCache.loadByClassName('Moment')
    ]).then( (resp)=>resp[0].concat(resp[1]));
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

  static getLibraryItemFromCameraRoll( camerarollId: string):Promise<IMappiLibraryItem> {
    // TODO: should be able to get LibraryItem directly,
    // currently requires a scan, PhotoLibraryCordova.getLibrary()
    const found = AppCache.for('Cameraroll').get(camerarollId);
    if (!found) 
      console.warn( "TODO: should be able to get LibraryItem directly. id=", camerarollId );
    return Promise.resolve(found);
  }

  static getDataURLFromCameraRoll(photo:IPhoto, options:IMappiGetThumbnailOptions):Promise<string> {
    return new Promise( (resolve, reject)=>{
      if (photo.camerarollId=="fake"){
        setTimeout( ()=>{
          console.warn(  "@@ >> fake CameraRoll delay for id=", photo.uuid)
          const src = photo.src.replace(/\d+\/\d+/,[options.thumbnailWidth,options.thumbnailHeight].join('/') )
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
          } else {
            console.warn(`1. @@@ cameraroll PLUGIN resp, size=${data.length}`, options['cache_key']);
            resolve(  data  );
          }
        },
        function (err) {
          console.log('PhotoLibraryHelper._assignDataURL(): Error occured', err);
          reject(err);
        },
        options);
    })
  }




  /**
   * return IPhoto ready for view rendering, 
   * - each uncached response gets unique uuid
   * @param item 
   * @param cache
   * @param force
   */
  static libraryItem2Photo(item:IMappiLibraryItem, cache:boolean=false, force:boolean=false):IPhoto {
    if (!item) return null;
    if (cache && !force) {
      const found:IPhoto = AppCache.for('Photo').items().find(p=>p.camerarollId==item.id);
      if (found) return found;
    }
    // generates new IPhoto.uuid for each photo, does NOT cache
    const exifData = PhotoLibraryHelper._libraryResp2Exif(item);
    const photo = PhotoLibraryHelper._exif2Photo(exifData, item);
    if (cache) AppCache.for('Photo').set(photo);   // cache picked photo with unique p.uuid
    return photo;
  }




  /**
   * convert cameraroll LibraryItem to IPhoto for rendering in <app-marker-item>, 
   * 
   * @param exifData 
   * @param itemData 
   * @param thumbDim   optionally configure thumbSrc$ observer for thumbnails, e.g. 80x80 thumbnails 
   */
  static _exif2Photo(exifData:IExifPhoto, itemData?:IMappiLibraryItem):IPhoto {
    const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo', {seq:Date.now()});
    function _exifDate2ISO(s) {
      let parts = s.split(' ');
      return `${parts[0].replace(/\:/g,"-")}T${parts[1]}`;
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
      _isFavorite: itemData.isFavorite,
    }
    const photo:IPhoto = Object.assign(emptyPhoto, pickFromExif, pickFromItem);
    // # final adjustments
    photo.position = MappiMarker.position(photo);
    PhotoLibraryHelper.rotateDimByOrientation(photo);
    // if (AppConfig.device.platform != "ios"){
    //   Array.from([null, 'thumbSrc']).forEach(o=>{
    //     PhotoLibraryHelper.rotateDimByOrientation(photo, o);
    //   })
    // }
    if (MappiMarker.hasLoc(photo)==false) photo["_loc_was_map_center"] = true;

    console.log(`>>> _exif2Photo:IPhoto.camerarollId=${photo.camerarollId} `, photo.src, itemData && itemData.fileName);
    return photo;
  }



  /**
   * read jpeg data from NativeURI and get Exif metadata
   * @param item 
   * @param options 
   */
  static _libraryResp2Exif( item:IMappiLibraryItem, options?:any ): IExifPhoto {

    const exif = item['{Exif}'] || {};
    const gps = item['{GPS}'] || {};
    const tiff = item['{TIFF}'] || {};

    const exifData:IExifPhoto = {  
      

      // TODO: this src doesn't work with WKWebView
      src: item.filePath,


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


}
