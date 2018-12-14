/**
 * called by marker-add
 * present modal for 
 * - geocoding, search for humanized place/address => [lat,lng]
 * - reverse geocoding: IMarker.loc => placeid and/or human address
 */

import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, } from '@angular/core';
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
  styleUrls: ['./geocode.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  public placecoderResults$: Observable<google.maps.places.AutocompletePrediction[]>;
  public markerSubj: BehaviorSubject<IMarker[]> = new BehaviorSubject<IMarker[]>([]); 
  public markerCollection$ : Observable<IMappiMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {
    activeView: false
  };

  constructor(
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef,
  ) {}

  ngOnInit() {

    /*************** 
     * set active module, right now it's either or
    */
    this.stash.controller = "Geocoder" // enum [Geocoder, GmPlaces]
    /*************** */

    this.search.value = this.initialValue;
    this.geocoderResults$ = Geocoder.resp$;
    this.placecoderResults$ = GmPlaces.resp$
    // .pipe(
    //   takeUntil( this.unsubscribe$ ),
    //   map( (items)=>{
    //     return items.map( o=>{PlaceCoder.formatAsMarker(o)} )
    //   }),
    // );
    
    this.markerCollection$ = this.geocoderResults$.pipe( 
      takeUntil( this.unsubscribe$ ),
      map( (items)=>{
        const mapped = items && items.map( o=>Geocoder.formatAsMarker(o) );
        return mapped;
      }),
    )
    this.stash.activeView = true;
    

    // submit initial value
    if (this.initialValue) this.handle_addBySearchBar();
  }


  /**
   * expecting the following from user:
   *  a) lat,lng input for reverse geo-coding
   *  b) input search phrase => call places.AutocompleteService() get a place_id => create Marker
   * @param ev 
   */
  async searchBarInput(ev:any){
    const REQUIRE_BUTTON_PRESS_TO_SUBMIT_MARKERLINK = true;

    if (this.stash.enableCreateMarkerLink) return;

    if (ev.detail) {
      // wait for ngModel to update this.stash.search.value;
      return setTimeout(()=>{
        const value = this.stash.search.value;
        if (value) this.stash.enableCreateMarkerLink = true;
        this.cd.detectChanges();  // render updated disabled for button

        if (ev.detail.inputType=="insertFromPaste"){  
          if (REQUIRE_BUTTON_PRESS_TO_SUBMIT_MARKERLINK) return;

          // skip ionBlur, add MarkerLink
          return this.handle_addBySearchBar();  // same as (ionBlur) method
        }
      });
    }

  }

  searchBarClear(){
    this.stash.enableCreateMarkerLink = false;
    Geocoder.reset();
    GmPlaces.reset();
  }

  async handle_addBySearchBar(){
    const value = this.search.value;
    this.stash.zeroResults = false;
    this.stash.loading = true;

    switch (this.stash.controller){
      case "Geocoder":{
        const resp = await Geocoder.search(value);
        if (resp==google.maps.GeocoderStatus.ZERO_RESULTS) {
          this.stash.zeroResults = true;
        }
        return;
      }
      case "GmPlaces":{
        // disabled. right now using MarkerAddComponent with places.Autocomplete instead
        const resp = await GmPlaces.search(value);
        if (resp==google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          this.stash.zeroResults = true;
        }
        return;
      }
    }
    this.stash.loading = false;
  }


  async select(place:google.maps.GeocoderResult){
    switch (this.stash.controller){
      case "Geocoder":{
        const marker = Geocoder.formatAsMarker(place);
        return this.commit(marker);
      }
      case "GmPlaces":{
        const placeDetail = await GmPlaces.getPlaceDetails(place.place_id);
        const marker = GmPlaces.formatAsMarker(placeDetail);
        GmPlaces.reset(true);
        return this.commit(marker);
      }
    }
  }

  async close(dismiss:boolean=true) {
    if (dismiss && (this.isModal || this["modal"]) ) {
      await this["modal"].dismiss({data:null});
    }
    this.stash.activeView = false;
    this.unsubscribe$.next(true);
    return;
  }

  async commit(marker?:IMarker):Promise<{ selected:IMarker }> {
    if (!marker) {
      switch (this.stash.controller){
        case "Geocoder":{
          if (Geocoder.respSubj.value.length==1) {
            const marker = Geocoder.formatAsMarker(Geocoder.respSubj.value[0]);
            return this.commit(marker);
          } 
        }
        case "GmPlaces":{
          if (GmPlaces.respSubj.value.length==1) {
            const prediction = GmPlaces.respSubj.value[0];
            const placeDetail = await GmPlaces.getPlaceDetails(prediction.place_id);
            const marker = GmPlaces.formatAsMarker(placeDetail);
            GmPlaces.reset(true);
            return this.commit(marker);
          } 
        }
      }
    }
    this.close(false);
    const data = {selected: marker}; 
    if (this.isModal || this["modal"] ) {
      await this["modal"].dismiss(data);  // pass selected back to opener
    }
    
    return Promise.resolve(data);
  }
}




/**
 * GUIDLINES:
 * a) use reverse-geocode to get name,description,place_id from marker.loc
 * b) (preferred) MarkerAddComponent uses google.maps.places.Autocomplete
 * c) use programmatic AutocompleteService + getDetails() to add a marker by text input.
 * d) use findPlaceFromQuery() to locate MarkerLinks
 */


/**
 * static class for managing google.maps.places methods
 * - Autocomplete: get suggestions for places by string, locationBias, 
 *    1) show autocomplete predictions, AutocompletePrediction[]
 *    2) user selects one AutocompletePrediction
 *    3) use PlacesService.getDetails() with sessionToken to get details from AutocompletePrediction.place_id
 * 
 * - PlacesService: get fields for placeId by place_id or text string
 *  findPlaceFromQuery():
 *    1) show places from findPlaceFromQuery(), PlaceResult[]
 *    2) user selects one result, PlaceResult. getDetails() optional
 *  getDetails({placeId:})
 *    1) get detailed fields for place_id
 *    2) refresh stale place_ids, getDetails({placeId:, fields:['place_id']) (free)
 * 
 * NOTE: use GmGeocode for finding place_id by loc:[lat,lng], then call PlacesService.getDetails()
 */

export const PLACES_SERVICE_FIELDS = {
  // see pricing: https://cloud.google.com/maps-platform/pricing/sheet/
  // service = new google.maps.places.PlacesService(map)
  findPlaceFromQuery: {
    // service.findPlaceFromQuery({query:, fields:, locationBias:}, callback)
    BASIC: ['formatted_address', 'geometry', 'icon', 'id', 'name', 'permanently_closed', 'photos', 'place_id', 'plus_code', 'scope', 'types'],
    CONTACT: ['opening_hours.open_now'],
    ATMOSPHERE: ['price_level', 'rating'],
  },
  getDetails: {
    // service.getDetails({placeId:, fields: sessionToken:}, callback)
    BASIC: ['address_component', 'adr_address', 'alt_id', 'formatted_address', 'geometry', 'icon', 'id', 'name', 'permanently_closed', 'photo', 'place_id', 'plus_code', 'scope', 'type', 'url', 'utc_offset', 'vicinity'],
    CONTACT: ['formatted_phone_number', 'international_phone_number', 'opening_hours', 'website'],
    ATMOSPHERE: ['price_level', 'rating', 'review'],
  },
}

export class GmPlaces {
  public static sessionToken: google.maps.places.AutocompleteSessionToken;
  public static instance: google.maps.places.AutocompleteService;
  public static respSubj: BehaviorSubject<google.maps.places.AutocompletePrediction[]> = new BehaviorSubject<google.maps.places.AutocompletePrediction[]>([]);
  public static resp$: Observable<google.maps.places.AutocompletePrediction[]> = GmPlaces.respSubj.asObservable();

  private static async _setInstance():Promise<any>{
  }

  /**
   * 
   * @param value string 
   */
  public static async searchPlace( value: string ):Promise<google.maps.places.PlacesServiceStatus> {
    if (!GmPlaces.instance) {
      try {
        await AppConfig.mapReady;
        GmPlaces.instance = new google.maps.places.AutocompleteService();
      } catch (err) {
        const msg = `ERROR: google.maps.places.AutocompleteService() instance not found, check if Google Maps SDK loaded.`;
        console.error(msg, err);
        return Promise.reject(msg);
      }
    }
    if (!GmPlaces.sessionToken) GmPlaces.sessionToken = new google.maps.places.AutocompleteSessionToken();

    const options = {
      input: value,
      bounds: AppConfig.map.getBounds(),
      strictBounds: false,
      sessionToken: GmPlaces.sessionToken,
      // types: ['establishment'],
      // see: https://developers.google.com/maps/documentation/javascript/places-autocomplete
      // types: [ establishment, geocode, address, (regions), (cities)]
      // try these additional types: "point_of_interest", "food",
    }

    if ("use demo data" && true ){
      GmPlaces.respSubj.next(AUTOCOMPLETE_PREDICTIONS as any as google.maps.places.AutocompletePrediction[]);
      return Promise.resolve(google.maps.places.PlacesServiceStatus.OK)
    }

    return new Promise<google.maps.places.PlacesServiceStatus>( (resolve, reject)=>{
      GmPlaces.instance.getPlacePredictions(options, (resp, status)=>{
        switch (status){
          case google.maps.places.PlacesServiceStatus.OK:      
            console.log(`PlaceCoder resp=`,resp);
            GmPlaces.respSubj.next(resp);
            return resolve(status);
          case google.maps.places.PlacesServiceStatus.NOT_FOUND:  
          case google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
            return resolve(status);
          case google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
          case google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
            console.warn("Google Maps API quota limit reached");
          default:
            return reject(status);
        }
      });
    });
  }

  /**
   * ???: is Geocoder.geocode({placeId:placeId}) preferred?
   * @param placeId 
   */
  public static getPlaceDetails(placeId:string):Promise<google.maps.places.PlaceResult> {
    const options ={
      placeId,
      sessionToken: GmPlaces.sessionToken,
      fields:['name', 'place_id', 'formatted_address', 'geometry.location', 'types']
      // also: rating, reviews, website, icon, international_phone_number, etc.
    }
    const places = new google.maps.places.PlacesService(AppConfig.map);
    return new Promise<google.maps.places.PlaceResult>( (resolve, reject)=>{
      places.getDetails(options, (resp, status)=>{
        switch (status){
          case google.maps.places.PlacesServiceStatus.OK:      
            console.log(`PlaceDetails resp=`,resp);
            return resolve(resp);
          case google.maps.places.PlacesServiceStatus.NOT_FOUND:  
          case google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
            return resolve(null);
          case google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
          case google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
            console.warn("Google Maps API quota limit reached");
          default:
            return reject(null);
        }
      });
    });
  }

  public static async search( address ):Promise<google.maps.places.PlacesServiceStatus>{
    const resp = await GmPlaces.searchPlace(address);
    return resp;
  }
  public static reset(sessionToken:boolean=false) {
    if (sessionToken) GmPlaces.sessionToken = null;
    GmPlaces.respSubj.next([]);
  }

  public static formatAsMarker(o:google.maps.places.PlaceResult):IMarker {
    const position:any = o.geometry.location.toJSON ? o.geometry.location.toJSON() : o.geometry.location;
    const m:IMappiMarker = {
      uuid: quickUuid(),
      className: 'PlaceResultMarker',
      placeId: o.place_id,
      loc: [position.lat, position.lng],
      locOffset: [0,0],
      position: null,
    }
    m.position = MappiMarker.position(m);
    m['label'] = o.name;
    m['description'] = o.formatted_address;
    m['_placeResult'] = o;
    return m;
  }


}




/**
 * static class for google.maps.Geocoder methods
 * 
 * typically used for **REVERSE** geocoding, get address (but NOT name,description) by place_id or loc:[lat,lng]
 * if the user wants to create a marker from text, use Autocomplete or PlaceService.findPlaceFromQuery() instead
 * 
 * see: https://developers.google.com/maps/documentation/javascript/geocoding
 * examples:
 *  - https://developers.google.com/maps/documentation/javascript/examples/geocoding-reverse
 * 
 * - Geocoder.geocode(): get address, place_id, loc by address, place_id
 *    1) show results, GeocoderResult[], e.g. different place_ids at the same location
 *    2) user selects one GeocoderResult
 *    3) use PlacesService.getDetails()  to get details, e.g. name/description from GeocoderResult.place_id
 * 
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
      if ("use demo data" && true){
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

  /**
   * geocode address or reverse geocode lat,lng string
   * @param value 
   */
  public static async search( value:string ):Promise<google.maps.GeocoderStatus>{
    const resp = await Geocoder.geocode(value);
    return resp;
  }
  public static reset() {
    Geocoder.respSubj.next([]);
  }
  public static formatAsMarker(o:google.maps.GeocoderResult):IMarker {
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
    m['_geocoderResult'] = o;
    return m;
  }

}


const AUTOCOMPLETE_PREDICTIONS = [
  {
    "description": "Jaya Grocer The Intermark, Jalan Tun Razak, Kampung Datuk Keramat, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "id": "6eae05250b426f92dd02eb2d6329b2ac562aa553",
    "matched_substrings": [
      {
        "length": 11,
        "offset": 0
      }
    ],
    "place_id": "ChIJsyDWh883zDERxK9Rh5ICQaw",
    "reference": "ChIJsyDWh883zDERxK9Rh5ICQaw",
    "structured_formatting": {
      "main_text": "Jaya Grocer The Intermark",
      "main_text_matched_substrings": [
        {
          "length": 11,
          "offset": 0
        }
      ],
      "secondary_text": "Jalan Tun Razak, Kampung Datuk Keramat, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia"
    },
    "terms": [
      {
        "offset": 0,
        "value": "Jaya Grocer The Intermark"
      },
      {
        "offset": 27,
        "value": "Jalan Tun Razak"
      },
      {
        "offset": 44,
        "value": "Kampung Datuk Keramat"
      },
      {
        "offset": 67,
        "value": "Kuala Lumpur"
      },
      {
        "offset": 81,
        "value": "Federal Territory of Kuala Lumpur"
      },
      {
        "offset": 116,
        "value": "Malaysia"
      }
    ],
    "types": [
      "establishment"
    ]
  },
  {
    "description": "Jaya Grocer, Jalan Tun Razak, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "id": "4b2cc7308e921a0d775443656e0ab2cc805ee714",
    "matched_substrings": [
      {
        "length": 11,
        "offset": 0
      }
    ],
    "place_id": "ChIJr6yIacU3zDERbmZ_dVXtPcY",
    "reference": "ChIJr6yIacU3zDERbmZ_dVXtPcY",
    "structured_formatting": {
      "main_text": "Jaya Grocer",
      "main_text_matched_substrings": [
        {
          "length": 11,
          "offset": 0
        }
      ],
      "secondary_text": "Jalan Tun Razak, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia"
    },
    "terms": [
      {
        "offset": 0,
        "value": "Jaya Grocer"
      },
      {
        "offset": 13,
        "value": "Jalan Tun Razak"
      },
      {
        "offset": 30,
        "value": "Kuala Lumpur"
      },
      {
        "offset": 44,
        "value": "Federal Territory of Kuala Lumpur"
      },
      {
        "offset": 79,
        "value": "Malaysia"
      }
    ],
    "types": [
      "establishment"
    ]
  },
  {
    "description": "Jaya Grocer, The Gardens Mall, Mid Valley City, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "id": "385451e86fe5adc891cdec26f7a90c060d6983e7",
    "matched_substrings": [
      {
        "length": 11,
        "offset": 0
      }
    ],
    "place_id": "ChIJp6r6H49JzDERvMM2VUdCqEw",
    "reference": "ChIJp6r6H49JzDERvMM2VUdCqEw",
    "structured_formatting": {
      "main_text": "Jaya Grocer, The Gardens Mall",
      "main_text_matched_substrings": [
        {
          "length": 11,
          "offset": 0
        }
      ],
      "secondary_text": "Mid Valley City, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia"
    },
    "terms": [
      {
        "offset": 0,
        "value": "Jaya Grocer, The Gardens Mall"
      },
      {
        "offset": 31,
        "value": "Mid Valley City"
      },
      {
        "offset": 48,
        "value": "Kuala Lumpur"
      },
      {
        "offset": 62,
        "value": "Federal Territory of Kuala Lumpur"
      },
      {
        "offset": 97,
        "value": "Malaysia"
      }
    ],
    "types": [
      "establishment"
    ]
  },
  {
    "description": "Jaya Grocer @ KL Eco City, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "id": "4b29dea38a3b277fa0088f3eb2555cf6a417ace2",
    "matched_substrings": [
      {
        "length": 11,
        "offset": 0
      }
    ],
    "place_id": "ChIJoeN0RARJzDERBsOZyR2F904",
    "reference": "ChIJoeN0RARJzDERBsOZyR2F904",
    "structured_formatting": {
      "main_text": "Jaya Grocer @ KL Eco City",
      "main_text_matched_substrings": [
        {
          "length": 11,
          "offset": 0
        }
      ],
      "secondary_text": "Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia"
    },
    "terms": [
      {
        "offset": 0,
        "value": "Jaya Grocer @ KL Eco City"
      },
      {
        "offset": 27,
        "value": "Kuala Lumpur"
      },
      {
        "offset": 41,
        "value": "Federal Territory of Kuala Lumpur"
      },
      {
        "offset": 76,
        "value": "Malaysia"
      }
    ],
    "types": [
      "establishment"
    ]
  },
  {
    "description": "Bangsar Market by Jaya Grocer, Jalan Bangsar, Kampung Haji Abdullah Hukum, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia",
    "id": "600fa82ca4c4dcd5978a57289a52715ea3130c6e",
    "matched_substrings": [
      {
        "length": 11,
        "offset": 18
      }
    ],
    "place_id": "ChIJtxPrT9FJzDERjM16M34LMfU",
    "reference": "ChIJtxPrT9FJzDERjM16M34LMfU",
    "structured_formatting": {
      "main_text": "Bangsar Market by Jaya Grocer",
      "main_text_matched_substrings": [
        {
          "length": 11,
          "offset": 18
        }
      ],
      "secondary_text": "Jalan Bangsar, Kampung Haji Abdullah Hukum, Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia"
    },
    "terms": [
      {
        "offset": 0,
        "value": "Bangsar Market by Jaya Grocer"
      },
      {
        "offset": 31,
        "value": "Jalan Bangsar"
      },
      {
        "offset": 46,
        "value": "Kampung Haji Abdullah Hukum"
      },
      {
        "offset": 75,
        "value": "Kuala Lumpur"
      },
      {
        "offset": 89,
        "value": "Federal Territory of Kuala Lumpur"
      },
      {
        "offset": 124,
        "value": "Malaysia"
      }
    ],
    "types": [
      "establishment"
    ]
  }
];


// fields:['name', 'place_id', 'formatted_address', 'geometry.location', 'types']
const PLACE_RESULT = {
  "formatted_address": "Level 2, KLEC Mall, No. 3, Jalan Bangsar, Kampung Haji Abdullah Hukum, 59200 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia",
  "geometry": {
    "location": {
      "lat": 3.1159777,
      "lng": 101.67414009999993
    }
  },
  "name": "Bangsar Market by Jaya Grocer",
  "place_id": "ChIJtxPrT9FJzDERjM16M34LMfU",
  "types": [
    "grocery_or_supermarket",
    "store",
    "point_of_interest",
    "food",
    "establishment"
  ],
  "html_attributions": []
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