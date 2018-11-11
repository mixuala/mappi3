import { Component, OnInit, Input, Renderer2, ElementRef, Inject, ViewEncapsulation,
  SimpleChange, EventEmitter, Output, ChangeDetectionStrategy,
} from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { Plugins } from '@capacitor/core';


import { GoogleMapsReady } from '../providers/mappi/google-maps-ready';
import { AppConfig } from '../providers/helpers';

const { Geolocation } = Plugins;
const INITIAL_MAP_ZOOM = 10;

@Component({
  selector: 'app-google-maps-host',
  templateUrl: './google-maps.component.html',
  styleUrls: ['./google-maps.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleMapsHostComponent implements OnInit {

  @Input('apiKey') apiKey: string;

  public static currentLoc: google.maps.LatLng;

  public map: google.maps.Map;
  public mapReady: Promise<google.maps.Map>;   // resolved after map `idle` event

  private _mapDeferred: { 
    promise:  Promise<google.maps.Map>, 
    resolve:  (o:google.maps.Map)=>void, 
    reject:   (err:any)=>void
  }; 

  constructor(
    private renderer: Renderer2, 
    private element: ElementRef, 
    @Inject(DOCUMENT) private _document,
  ) {
    // prepare Promise<google.map.Maps> for resolve in ngOnInit()
    this._mapDeferred = (()=>{
      let resolve;
      let reject;
      AppConfig.mapReady = this.mapReady = new Promise<google.maps.Map>((res, rej) => {
          resolve = res;
          reject = rej;
      });
      return { promise:this.mapReady, resolve, reject };
    })();
  }

  ngOnInit() {
    // inject google maps SDK
    new GoogleMapsReady(this.apiKey, this.renderer, this._document).init()
    .then( ()=>this._loadMap() )
    .then( 
      (map)=>{
        // resolve this.mapReady
        AppConfig.mapKey = this.apiKey;
        AppConfig.map = this.map;
        this._mapDeferred.resolve(map);
        console.warn("> GoogleMapsHostComponent ngOnInit, map.id=", this.map['id']);
      } 
      , (err) => {
        console.log(err);
        this._mapDeferred.reject("Could not initialize Google Maps");
      }
    );
  }

  // get current position as mapCenter and create map
  private _loadMap(): Promise<google.maps.Map> { 
    // get map center before rendering first Map
    return GoogleMapsHostComponent.getCurrentPosition()
    .then ( (position)=>{
      const mapOptions:google.maps.MapOptions = {
        zoom: AppConfig.initialMapZoom || INITIAL_MAP_ZOOM,
        center: position,
      };
      this.map = new google.maps.Map(this.element.nativeElement, mapOptions);
      const mapIdle = this._waitForMapIdle();
      this.map['id'] = this.map['id'] || `gmap-${Date.now() % 99}`;
      return mapIdle;
    });
  }

  /**
   * the map is first rendered and ready to use on `idle`
   */
  private _waitForMapIdle():Promise<google.maps.Map> {
    return new Promise<google.maps.Map>( (resolve, reject)=>{
      google.maps.event.addListenerOnce(this.map, 'idle', (event)=> {
        resolve(this.map);
      });
    });
  }

  static getCurrentPosition():Promise<google.maps.LatLng> {
    if (GoogleMapsHostComponent.currentLoc)
      return Promise.resolve(GoogleMapsHostComponent.currentLoc);

    return Geolocation.getCurrentPosition()
    .then(
      (position) => {
        console.log(position);
        return GoogleMapsHostComponent.currentLoc = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
      }, 
      (err) => {
        let isGeoLocationError = false;
        if (err.message=="User denied Geolocation") isGeoLocationError=true;
        if (err.message.startsWith("Origin does not have permission to use Geolocation")) isGeoLocationError=true;
        if (isGeoLocationError) {
          console.warn("Geolocation error, using test data");
          const position = {latitude: 3.1581906, longitude: 101.7379296};
          GoogleMapsHostComponent.currentLoc = new google.maps.LatLng(position.latitude, position.longitude);
          return Promise.resolve(GoogleMapsHostComponent.currentLoc);
        }
        console.error(err);
        Promise.reject('GoogleMapsHostComponent: Could not get current location.');
    })
  }

  ngOnDestroy() {
    // console.warn(`>>> destroy Map ${this.map['id']}, remove markers, count=${count}`);
    google.maps.event.clearInstanceListeners(this.map);
    return;
  }

}