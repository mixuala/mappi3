import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';

import * as Camera from '@ionic-native/camera/ngx';
import { Plugins, CameraSource } from '@capacitor/core';

import { MockDataService, IMarker, IPhoto, quickUuid } from '../mock-data.service';

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
          const options = {targetWidth:320};
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
        return this._getPlaceholder(seq);
    }) 
  }

  private _parseCameraWithExifResponse(resp:IExifPhoto, seq?:number):IPhoto{
    // function exifDate2ISO(s) {
    //   let parts = s.split(' ');
    //   return `${parts[0].replace(/\:/g,"-")}T${parts[1]}`;
    // }
    const p:IPhoto = {
      uuid: quickUuid(),
      dateTaken: PhotoService.localTimeAsDate(resp.exif.DatTimeOriginal).toISOString(),
      orientation: resp.tiff.Orientation,
      src: resp.src,
      loc: [resp.gps.lat, resp.gps.lng],
      locOffset: [0, 0],
      position: {
        lat: resp.gps.lat,
        lng: resp.gps.lng,
      },
      seq: seq,
      thumbnail: resp.src,    // TODO: get a thumbnail base64data
      width: resp.exif.PixelXDimension,
      height: resp.exif.PixelYDimension,
    }
    const {targetWidth, targetHeight} = resp;
    p.image = {
      width: targetWidth,
      height: targetHeight,
    }
    return p;
  }
  private _getPlaceholder(seq:number):Promise<IPhoto> {
    return this.dataService.Photos.get()
    .then(res => {
      // create placeholder mi derived from a random photo
      const random = (Date.now() % 99) + 1;
      const o = {
        uuid: quickUuid(),
        dateTaken: new Date().toISOString(),
        thumbnail: null, 
        src: null,
        locOffset: [0, 0],
        position: null,
      };      
      // create a new photo by modifying attrs of a random clone
      const p: IPhoto = Object.assign(res[random % res.length], o);
      MockDataService.inflatePhoto(p, seq);
      // randomize location
      const randomOffset = [Math.random(), Math.random()].map(v => (v - 0.5) / 60);
      // update IMarker
      p.loc = [p.loc[0] + randomOffset[0], p.loc[1] + randomOffset[1]];
      p.position = PhotoService.position(p);
      return p;
    })
  }




}
