import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';

import * as Camera from '@ionic-native/camera/ngx';
import { Plugins, CameraSource } from '@capacitor/core';

import { AppComponent } from '../../app.component';
import { MockDataService, RestyTrnHelper, IMarker, IPhoto, quickUuid } from '../mock-data.service';

const { Device } = Plugins;



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
  thumbnail?: string,
  targetWidth?: number,
  targetHeight?: number,
}


@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  constructor(
    public dataService: MockDataService,
    private platform: Platform,
  ) { }

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
  static position(item: IMarker): {lat, lng} {
    const offset = item.locOffset || [0,0];
    return {
      lat: item.loc[0] + offset[0],
      lng: item.loc[1] + offset[1],
    }
  }

  protected getImgSrc(imageData, options):string{
    try {
      switch (options.destinationType) {
        case Camera.DestinationType.FILE_URL:
          //  ERROR: Not allowed to load local resource
          const convertFileSrc = window['Ionic'].WebView.convertFileSrc;
          return convertFileSrc(imageData);
          break;
        case Camera.DestinationType.DATA_URL:
          // If it's base64 (DATA_URL):
          return 'data:image/jpeg;base64,' + imageData;
          break;
      }         
    } catch (err) {
      console.warn("setImgSrc():", err)
    }
  }

  protected parseResponse( result:any, options:Camera.CameraOptions ):Promise<IExifPhoto> {
    return Device.getInfo()
    .then( device=>{ 
      const resp = JSON.parse(result);
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
        src: this.getImgSrc(imageData, options),
        exif: metadata.Exif || {},
        gps: metadata.GPS || {},
        tiff: metadata['{TIFF}'] || {},
      }
      Array.from(['targetWidth', 'targetHeight']).forEach( k=>{
        if (options[k]) response[k]=options[k];
      });
      return response;
    });
  }


  // TODO: also get a thumbnail from the same source
  async exif_GetImage(options:any={}):Promise<IExifPhoto>{
    const self = this;
    
    return this.platform.ready()
    .then( ()=> {
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
          (res)=>{
            this.parseResponse(res, options)
            .then( resp=>{
              resolve(resp);
            });
          }, 
          (err)=>{
            this.onFail(err)
            reject(err);
          }, 
          options
        );
      })
    });
  }

  onFail(message) {
    // setTimeout(()=>this.cd.detectChanges());
    alert('Failed because: ' + message);
  }





  /**
   * UI Helper functions for Components
   */
  choosePhoto(seq?:number):Promise<IPhoto>{
    return Device.getInfo()
    .then( device=>{
      switch (device.platform){
        case 'ios':
        case 'android':
          const options = {targetWidth: Math.min(AppComponent.screenWidth, AppComponent.screenHeight)};
          return this.exif_GetImage(options)
          .then( (data)=>{
            return this._parseCameraWithExifResponse(data, seq)
          })  
        case 'web':
        default:
          return Promise.reject('continue');
      }
    })
    .catch( (err)=>{
      if (err=='continue')
        return this._getRandomPhoto(seq);
    }) 
  }

  private _parseCameraWithExifResponse(resp:IExifPhoto, seq?:number):IPhoto{
    const emptyPhoto = RestyTrnHelper.getPlaceholder('Photo');
    function _exifDate2ISO(s) {
      let parts = s.split(' ');
      return `${parts[0].replace(/\:/g,"-")}T${parts[1]}`;
    }
    function _calcImgSrcDim(resp):{width:number,height:number}{
      let {targetWidth, targetHeight } = resp;
      const {PixelXDimension, PixelYDimension} = resp.exif;
      if (PixelXDimension && PixelYDimension) {
        if (!targetWidth && targetHeight) {
          targetWidth = targetHeight*PixelXDimension/PixelYDimension;
        } else if (targetWidth && !targetHeight) {
          targetHeight = targetWidth*PixelYDimension/PixelXDimension;
        }
      }
      return {
        width: targetWidth,
        height: targetHeight,
      }
    }
    function _rotateDim(p:IPhoto):IPhoto{
      if (p.orientation > 4){
        const {width, height} = p;
        p.width = height;
        p.height = width;
      }
      if (p.orientation > 4){
        const {width, height} = p.image;
        p.image.width = height;
        p.image.height = width;
      }
      return p;
    }

    const exif:any = resp.exif || {};
    const tiff:any = resp.tiff || {};
    const gps:any = resp.gps || {};
    const gpsLoc:[number,number] = gps.lat && gps.lng ? [gps.lat, gps.lng] : [0,0];
    let localTime:string;
    try {
      // localTime = PhotoService.localTimeAsDate( _exifDate2ISO(exif.DateTimeOriginal) ).toISOString();
      localTime = new Date( _exifDate2ISO(exif.DateTimeOriginal) ).toISOString();
    } catch (err) {
      localTime = null;
    }
    const p:IPhoto = Object.assign(emptyPhoto, {
      uuid: quickUuid(),
      dateTaken: localTime,
      orientation: tiff.Orientation || 1,
      src: resp.src,
      loc: gpsLoc,
      position: {
        lat: gpsLoc[0],
        lng: gpsLoc[1],
      },
      seq: seq,
      thumbnail: resp.src,    // TODO: get a thumbnail base64data
      width: exif.PixelXDimension,
      height: exif.PixelYDimension,
    })
    // # final adjustments
    p.image = _calcImgSrcDim(resp);
    _rotateDim(p);
    if (p.loc.join() === [0,0].join()) p["_loc_was_map_center"] = true;
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
      p.position = PhotoService.position(p);
      p.loc = [p.position.lat, p.position.lng];
      p.locOffset = [0,0];
      MockDataService.inflatePhoto(p, seq);
      return p;
    })
  }




}
