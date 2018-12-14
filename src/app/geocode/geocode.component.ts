/**
 * called by marker-add
 * present modal for 
 * - geocoding, search for humanized place/address => [lat,lng]
 * - reverse geocoding: IMarker.loc => placeid and/or human address
 */

import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, map, switchMap, filter, skipWhile, first } from 'rxjs/operators';

import {
  IMarker, IMapActions, IMappiMarker, 
} from '../providers/types';
import { AppConfig } from '../providers/helpers';
import { MappiMarker, quickUuid } from '../providers/mappi/mappi.service';

@Component({
  selector: 'app-geocode',
  templateUrl: './geocode.component.html',
  styleUrls: ['./geocode.component.scss']
})
export class GeocodeComponent implements OnInit {

  /**
   * launch as Modal
   * @param modalCtrl 
   * @param options options.onDismiss:(resp:{selected:IMarker})=>Promise<void>
   */
  static async presentModal(modalCtrl:ModalController, options?:any):Promise<any>{

    options = Object.assign( {isModal:true}, options );
    return modalCtrl.create({
      component: GeocodeComponent,
      componentProps: options,
    })
    .then( async (modal) => {
      modal.classList.add('geocode-modal');  
      modal.present();
      await modal.onWillDismiss().then( async (resp)=>{
        console.log(">>> Geocode Modal dismissed, selected=", resp.data);
        return options.onDismiss && options.onDismiss(resp.data);
      })
      return modal.onDidDismiss();
    });
  }  




  public isModal:boolean = false;      // set by GeocodeComponent.presentModal(, options)
  public initialValue:string;          // set by options={initialValue}
  public search:any = {
    searchIcon: 'map',
    placeholder: 'enter location',
    type: 'search',
    value: null,
  }

  // google map properties
  public mapSettings: IMapActions = {
    initialZoom: 12,
    resetBounds: true,
    dragend: false,
    click: false,
    clickadd: false,
  }

  private _selectedMarker: string;
  public get selectedMarker() { return this._selectedMarker }
  public set selectedMarker(value: string) {
    this._selectedMarker = value;
    // setTimeout(()=>this.cd.detectChanges())
  }

  public geocoderResults$: Observable<google.maps.GeocoderResult[]>;
  public markerSubj: BehaviorSubject<IMarker[]> = new BehaviorSubject<IMarker[]>([]); 
  public markerCollection$ : Observable<IMappiMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {
    activeView: false
  };

  constructor(
    private modalCtrl: ModalController,
  ) {}

  ngOnInit() {
    this.search.value = this.initialValue;
    this.geocoderResults$ = Geocoder.resp$;
    
    this.markerCollection$ = this.geocoderResults$.pipe( 
      takeUntil( this.unsubscribe$ ),
      map( (items)=>{
        const mapped = items && items.map( o=>Geocoder.geocodeResult2Marker(o) );
        return mapped;
      }),
    )
    this.stash.activeView = true;

    // submit initial value
    if (this.initialValue) this.handle_addBySearchBar(null);
  }



  searchBarInput(ev:any){
    if (ev && ev.detail && ev.detail.inputType=="insertFromPaste"){
      console.log("keyboard PASTE detected value=", this.stash.search.value);
    }
    console.log('searchBarInput', ev);
  }

  searchBarClear(){
    Geocoder.reset();
  }

  async handle_addBySearchBar(ev:MouseEvent){
    const value = this.search.value;
    this.stash.zeroResults = false;
    this.stash.loading = true;
    const resp = await Geocoder.search(value);
    this.stash.loading = false;
    if (resp==google.maps.GeocoderStatus.ZERO_RESULTS) {
      this.stash.zeroResults = true;
    }
  }

  handle_MapMarkerSelected(ev){
  }

  select(place:google.maps.GeocoderResult){
    this.commit(place);
  }

  async close(dismiss:boolean=true) {
    if (dismiss && (this.isModal || this["modal"]) ) {
      await this["modal"].dismiss({data:null});
    }
    this.stash.activeView = false;
    this.unsubscribe$.next(true);
    return;
  }

  async commit(place?:google.maps.GeocoderResult):Promise<{ selected:IMarker }> {
    if (!place) {
      if (Geocoder.respSubj.value.length==1)
        return this.commit(Geocoder.respSubj.value[0]);
      else {
        // alert user to make a choice
        return;
      }
    }
    this.close(false);
    const data = {selected: Geocoder.geocodeResult2Marker(place) }; 
    if (this.isModal || this["modal"] ) {
      await this["modal"].dismiss(data);  // pass selected back to opener
    }
    
    return Promise.resolve(data);
  }
}



/**
 * static class for google.maps.Geocoder methods
 */
export class Geocoder {


  public static instance: google.maps.Geocoder;
  public static respSubj: BehaviorSubject<google.maps.GeocoderResult[]> = new BehaviorSubject<google.maps.GeocoderResult[]>([]);
  public static resp$: Observable<google.maps.GeocoderResult[]> = Geocoder.respSubj.asObservable();
  /**
   * geocode input[value]
   * @param value string, address/place, or "[number],[number]" or [lat, lng]
   */
  public static async geocode( value: string | [number, number] ): Promise<google.maps.GeocoderStatus>{
    if (!Geocoder.instance) {
      try {
        await AppConfig.mapReady;
        Geocoder.instance = new google.maps.Geocoder();
      } catch (err) {
        const msg = `ERROR: google.maps.Geocoder() instance not found, check if Google Maps SDK loaded.`;
        console.error(msg, err);
        return Promise.reject(google.maps.GeocoderStatus.UNKNOWN_ERROR);
      }
    }
    const options = {
      bounds: AppConfig.map.getBounds(),
    };
    const isLatLon = /^(\d+\.*\d*),(\d*\.*\d*)$/
    if (typeof value == 'string') {
      const loc = value.match(isLatLon);
      if (loc) {
        options['location'] = { lat:loc[0],lng:loc[1] }
      } 
      else options['address'] = value;
    }
    else options['location'] = { lat:value[0],lng:value[1] }

    Geocoder.respSubj.next([]);

    return new Promise<google.maps.GeocoderStatus>( (resolve, reject)=>{
      if ("use demo data" && false){
        Geocoder.respSubj.next(GEOCODE_RESULTS as any as google.maps.GeocoderResult[]);
        return Promise.resolve(google.maps.GeocoderStatus.OK)
      }

      Geocoder.instance.geocode( options, (resp, status)=>{
        switch (status){
          case google.maps.GeocoderStatus.OK:      
            if (options['location']) {
              // filter out approximate resp
              resp = resp.filter( o=>o.geometry.location_type != google.maps.GeocoderLocationType.APPROXIMATE);
            }
            console.log(`Geocode resp=`,resp);
            Geocoder.respSubj.next(resp);
            return resolve(status);
          case google.maps.GeocoderStatus.ZERO_RESULTS:
            return resolve(status);
          case google.maps.GeocoderStatus.REQUEST_DENIED:
          case google.maps.GeocoderStatus.OVER_QUERY_LIMIT:
            console.warn("Google Maps API quota limit reached");
          default:
            return reject(status);
        }
      });
    });
  }

  public static async search( address ):Promise<google.maps.GeocoderStatus>{
    const resp = await Geocoder.geocode(address);
    return resp;
  }
  public static reset() {
    Geocoder.respSubj.next([]);
  }
  public static geocodeResult2Marker(o:google.maps.GeocoderResult):IMarker {
    const position:any = o.geometry.location.toJSON ? o.geometry.location.toJSON() : o.geometry.location;
    const m:IMappiMarker = {
      uuid: quickUuid(),
      className: 'GeocodeResultMarker',
      placeId: o.place_id,
      loc: [position.lat, position.lng],
      locOffset: [0,0],
      position: null,
    }
    m.position = MappiMarker.position(m);
    m['label'] = o.formatted_address;
    m['description'] = o.types.join(', ');
    m['geocoderResult'] = o;
    return m;
  }

}




const GEOCODE_RESULTS = [{
  "address_components": [
    {
      "long_name": "303",
      "short_name": "303",
      "types": [
        "street_number"
      ]
    },
    {
      "long_name": "Jalan Ampang",
      "short_name": "Jalan Ampang",
      "types": [
        "route"
      ]
    },
    {
      "long_name": "Desa Pahlawan",
      "short_name": "Desa Pahlawan",
      "types": [
        "political",
        "sublocality",
        "sublocality_level_1"
      ]
    },
    {
      "long_name": "Kuala Lumpur",
      "short_name": "Kuala Lumpur",
      "types": [
        "locality",
        "political"
      ]
    },
    {
      "long_name": "Wilayah Persekutuan Kuala Lumpur",
      "short_name": "Wilayah Persekutuan Kuala Lumpur",
      "types": [
        "administrative_area_level_1",
        "political"
      ]
    },
    {
      "long_name": "Malaysia",
      "short_name": "MY",
      "types": [
        "country",
        "political"
      ]
    },
    {
      "long_name": "55000",
      "short_name": "55000",
      "types": [
        "postal_code"
      ]
    }
  ],
  "formatted_address": "303, Jalan Ampang, Desa Pahlawan, 55000 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia",
  "geometry": {
    "location": {
      "lat": 3.1602197,
      "lng": 101.73693939999998
    },
    "location_type": "ROOFTOP",
    "viewport": {
      "south": 3.158870719708498,
      "west": 101.7355904197085,
      "north": 3.161568680291502,
      "east": 101.73828838029146
    }
  },
  "place_id": "ChIJW2BdmLA3zDERQI0BrKeUURc",
  "plus_code": {
    "compound_code": "5P6P+3Q Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "global_code": "6PM35P6P+3Q"
  },
  "types": [
    "establishment",
    "point_of_interest",
    "shopping_mall"
  ]
},{
  "address_components": [
    {
      "long_name": "348",
      "short_name": "348",
      "types": [
        "street_number"
      ]
    },
    {
      "long_name": "Jalan Tun Razak",
      "short_name": "Jalan Tun Razak",
      "types": [
        "route"
      ]
    },
    {
      "long_name": "Kampung Datuk Keramat",
      "short_name": "Kampung Datuk Keramat",
      "types": [
        "political",
        "sublocality",
        "sublocality_level_1"
      ]
    },
    {
      "long_name": "Kuala Lumpur",
      "short_name": "Kuala Lumpur",
      "types": [
        "locality",
        "political"
      ]
    },
    {
      "long_name": "Wilayah Persekutuan Kuala Lumpur",
      "short_name": "Wilayah Persekutuan Kuala Lumpur",
      "types": [
        "administrative_area_level_1",
        "political"
      ]
    },
    {
      "long_name": "Malaysia",
      "short_name": "MY",
      "types": [
        "country",
        "political"
      ]
    },
    {
      "long_name": "50400",
      "short_name": "50400",
      "types": [
        "postal_code"
      ]
    }
  ],
  "formatted_address": "348, Jalan Tun Razak, Kampung Datuk Keramat, 50400 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia",
  "geometry": {
    "location": {
      "lat": 3.1614892,
      "lng": 101.71991449999996
    },
    "location_type": "ROOFTOP",
    "viewport": {
      "south": 3.160140219708498,
      "west": 101.71856551970848,
      "north": 3.162838180291502,
      "east": 101.72126348029155
    }
  },
  "place_id": "ChIJsyDWh883zDERxK9Rh5ICQaw",
  "plus_code": {
    "compound_code": "5P69+HX Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "global_code": "6PM35P69+HX"
  },
  "types": [
    "establishment",
    "food",
    "grocery_or_supermarket",
    "point_of_interest",
    "store",
    "supermarket"
  ]
}]