import { Observable, ReplaySubject } from 'rxjs';
import { DeviceInfo } from '@capacitor/core';
import { Platform } from '@ionic/angular';

import {
  IMarker, IPhoto,
} from './types'


/**
 * stash App (mostly) constants here. 
 * WARNING: do NOT use when app state is in transition, use Promise/Observer instead.
 */
export class AppConfig {
  static device:DeviceInfo;
  static platform: Platform;
  static devicePixelRatio:number;
  // changes on device rotate, or window dragged to new screen
  static screenWH:[number,number];

  // googleMap vars initialized in AppComponent
  static map: google.maps.Map;
  static mapKey: string;
  static mapReady: Promise<google.maps.Map>; // set in GoogleMapsHostComponent
  static initialMapZoom:number = 4;
  static currentLoc:{lat:number, lng:number};

  // init config "constants"
  static init = setTimeout( () => {
    AppConfig.devicePixelRatio = window.devicePixelRatio;
    ScreenDim.getWxH();
  }, 10);


  /**
   * for testing CSS4 on Mobile Safari
   * @param value 
   */
  static detectBrowser(device?:DeviceInfo):string {
    if (!device) device = AppConfig.device || {} as DeviceInfo;
    const {platform, model, manufacturer} = device;
    const el = document.getElementsByTagName('HTML')[0];
    el.classList.remove( 'mobile-safari', 'safari', 'chrome');

    let browser;

    if (platform=='ios' && model=='iPhone') {
      el.classList.add('safari');
      el.classList.add('mobile-safari');
      browser = 'mobile-safari';
    }
    else if (platform=='web' && model=='iPhone' && manufacturer == "Apple Computer, Inc.") {
      el.classList.add('safari'); // responsive mode
      browser = 'safari:responsive';
    }
    else if (platform=='web' && manufacturer == "Apple Computer, Inc.") {
      el.classList.add('safari'); // responsive mode
      browser = 'safari';
    }
    else if (platform=='web' && model=='iPhone' && manufacturer == "Google Inc.") {
      el.classList.add('chrome:responsive');
      browser = 'chrome';
    } else {
      // everything else is chrome
      el.classList.add('chrome');
      browser = 'chrome';
    }
    console.log('Detect browser for CSS, browser=',browser);
    return browser;
  }


}

/**
 * returns screen dimensions as ScreenDim.dim = Promise<`${w}x${h}`>
 * subscribe to ScreenDim.dim$ for updates, instead of 'window:resize' event
 * initialized on class load
 */
export class ScreenDim {
  private static _subj: ReplaySubject<string> = new ReplaySubject<string>(1);
  /**
   * use Observer when you want updates, e.g. async pipe
   *  this.screenDim$ = Screen.dim$
   *  <app-marker-item [dim]="screenDim$ | async"></app-marker-item>
   */
  static dim$:Observable<string> = ScreenDim._subj.asObservable();

  // called by AppComponent in 'window:resize' event
  static set(checkOnce:boolean=true, delay:number=10):Promise<string> {
    ScreenDim.dim = new Promise<string>( (resolve, reject)=>{
      setTimeout( ()=>{
        // add timeout to get correct values for innerWidth, innerHeight from resize event
        const _dim = [window.innerWidth, window.innerHeight].join('x');
        const check = _dim.split('x');
        if (check[0]==check[1] && checkOnce) {
          // 2nd try...
          return ScreenDim.set(false,100).then( __dim=>resolve(__dim));
        }
        console.log(`ScreenDim.set(${checkOnce}) [wxh]=`, _dim);
        ScreenDim.setOrientationClasses(_dim);
        resolve(_dim);
        AppConfig.screenWH = _dim.split('x').map(v=>parseInt(v)) as [number,number]
      }, delay);
    });
    ScreenDim.dim.then( _dim=>{ 
      ScreenDim._subj.next(_dim);
    })
    return ScreenDim.dim;
  }
  /**
   * use promise when you don't need updates, e.g. 
   *  const dim = await ScreenDim.dim
   * initialize on class load
   */
  static dim:Promise<string> = ScreenDim.set();

  // more helpers
  static getWxH():Promise<[number,number]> {
    return ScreenDim.dim.then( _dim=>_dim.split('x').map(v=>parseInt(v)) as [number,number] );
  }
  static getThumbDim(dim?:[number,number]):Promise<string> | string {
    function getSize(dim:[number,number]){
      const[fitW, fitH] = dim;
      const thumbsize = fitW < 768 ? 56 : 80;
      return `${thumbsize}x${thumbsize}`;
    }
    if (dim) return getSize(dim);
    return ScreenDim.getWxH().then( dim=>getSize(dim));
  }

  static setOrientationClasses(dim:string){
    const[fitW, fitH] = dim.split('x').map(v=>parseInt(v));
    const el = document.getElementsByTagName('HTML')[0]
    if (fitW>fitH) {
      el.classList.add('landscape');
      el.classList.remove('portrait')
    }
    else {
      el.classList.add('portrait');
      el.classList.remove('landscape');
    }
  }

}


export class Humanize {

  static position(p:IMarker | {lat:number, lng:number}, n:number=6){
    let pos:{lat:number, lng:number};
    if (p.hasOwnProperty('position')) pos = (p as IMarker).position;
    else pos = p as {lat:number, lng:number};
    const digits = Math.pow(10,n);
    return {
      lat: Math.round(pos.lat*digits)/digits,
      lng: Math.round(pos.lng*digits)/digits,
    }
  }

  static asLocalTime(p:IPhoto):Date {
    let getTzOffset = function(loc:[number,number]):number {
      // get timezone offset from location
      // let offset = res.dstOffset + res.rawOffset;
      return -3600;
    }
    let offset = getTzOffset(p.loc);
    let d = new Date(p.dateTaken);
    d.setTime( d.getTime() + offset*1000 );
    return d;
  }

}

/**
 * random helpful methods
 */
export class Helpful {
  public static shuffle(arr:any[], sample?:number|boolean):any[] {
    const shuffled = arr
      .map(a => [Math.random(), a])
      .sort((a, b) => a[0] - b[0])
      .map(a => a[1]);
    if (!sample) return shuffled
    if (sample===true)
      sample = Math.ceil(Math.random() * Math.floor(arr.length))
    return shuffled.slice(0,sample)
  }
  
  public static bytesToSize(bytes:number):string{ 
    if (bytes == 0) return '0 Bytes';
    const k = 1000;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
  }

}


