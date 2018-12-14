import { Component, EventEmitter, OnInit, Input, Output,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { LoadingController, ModalController } from '@ionic/angular';

import {
  IMarker, IRestMarker, IPhoto,
  IMoment, IChoosePhotoOptions, IMarkerLink, IMarkerGroup,
} from '../providers/types';
import { MockDataService, RestyTrnHelper, Prompt, } from '../providers/mock-data.service';
import { PhotoService,  } from '../providers/photo/photo.service';
import { CamerarollPage } from '../cameraroll/cameraroll.page';
import { GeocodeComponent, GmPlaces, PLACES_SERVICE_FIELDS,} from '../geocode/geocode.component';
import { AppConfig, } from '../providers/helpers';



const OG_BASEURL = "https://us-central1-mappi3-c91f1.cloudfunctions.net/getOpenGraph";
export class OpenGraphHelper {
  public static getOG(url, http:HttpClient):Promise<{}> {
    const options = {
      params: new HttpParams().set('url', url),
      headers: new HttpHeaders({ 'Content-Type':  'application/json',}),
    };
    return http.get<{}>(OG_BASEURL, options).toPromise();
  }
}



@Component({
  selector: 'app-marker-add',
  templateUrl: './marker-add.component.html',
  styleUrls: ['./marker-add.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerAddComponent implements OnInit {


  public stash:any = {
    search:{
      searchIcon: '',
      placeholder: 'enter location or link',
      type: 'search',
      value: null,
      await: false,
    }
  };
  public autocomplete: {
    instance: google.maps.places.Autocomplete,
    detach:()=>void,
  }

  @Input() marker: IMarker;
  @Output() camerarollSelected: EventEmitter<IPhoto[]> = new EventEmitter<IPhoto[]>();
  @Output() markerChange: EventEmitter<{data:IMarker, action:string}> = new EventEmitter<{data:IMarker, action:string}>();

  constructor(
    public dataService: MockDataService,
    public photoService: PhotoService,
    private modalCtrl: ModalController,
    private loadingController: LoadingController,
    private http: HttpClient,
    private cd: ChangeDetectorRef,
  ) { }

  ngOnInit() {
  }

  async handle_addByCameraRoll(ev:MouseEvent){
    const options={
      onDismiss: async (resp:any={}):Promise<void> => {
        if (!resp.selected || !resp.selected.length) return;
        const result = await this.camerarollSelected.emit( resp.selected);
      }
    }
    const selected = await CamerarollPage.presentModal(this.modalCtrl, options);
  }

  /**
   * expecting the following from user:
   *  a) paste a URL => /^http/, create a MarkerLink
   *  b) input search phrase => call attachAutocomplete() to get a place_id => create Marker
   *  
   * @param ev 
   */
  searchBarInput(ev:any){
    const REQUIRE_BUTTON_PRESS_TO_SUBMIT_MARKERLINK = true;

    if (this.stash.enableCreateMarkerLink) return;

    if (ev.detail) {
      // wait for ngModel to update this.stash.search.value;
      return setTimeout(()=>{
        const value = this.stash.search.value;

        if(value.toLowerCase().startsWith('http')){
          // enable button to trigger ionBlur
          if (ev.detail.inputType=="insertFromPaste"){
            this.stash.enableCreateMarkerLink = true;
            this.cd.detectChanges();
            if (REQUIRE_BUTTON_PRESS_TO_SUBMIT_MARKERLINK) return;

            // skip ionBlur, add MarkerLink
            return this.handle_addMarkerLink();
          } 
        }
        else { 
          // guard against ^http
          this.attachAutocomplete(); 
        }
      });
    }
  }


  async handle_addMarkerLink(){
    // scrape opengraph or reverse-geocode
    // WARNING: (ionBlur) fires BEFORE Autocomplete.(place_changed)
    const search = this.stash.search;
    const value = search.value;

    if (value && value.toLowerCase().startsWith('http')){
      // use suq() scrape opengraph

      // present loading overlay while scraping 
      const loading = await this.loadingController.create({
        duration: 10*1000
      });
      await loading.present();

      const opengraph = await OpenGraphHelper.getOG(value, this.http);
      const link = RestyTrnHelper.getPlaceholder('MarkerLink', opengraph);
      console.log( "MarkerLink, value=", link);

      // => HomePage.createMarkerGroup_fromMarker(change)
      await this.markerChange.emit({data:link, action:"add"});
      this.reset();
      loading.dismiss();
      return;
    } 
    else if ("ALLOW REVERSE-GEOCODE") {

      // if ("DISABLE REVERSE-GEOCODE FOR NOW") return;

      // use REVERSE-geocode
      const options = {
        initialValue: value,
        onDismiss: async (resp:{selected:IMarker}):Promise<void> => {
          this.reset();
          if (resp.selected) {
            console.log( "Create MarkerGroup from selected=", resp.selected);
            this.markerChange.emit( {data:resp.selected, action:'add'});
          }
          this.cd.detectChanges();
          return;
        },
      };
      
      const place = await GeocodeComponent.presentModal(this.modalCtrl, options);
    }
  }

  attachAutocomplete():any{
    if (!this.autocomplete) {
      const input = document.querySelector('ion-searchbar .searchbar-input');
      const autocomplete = new google.maps.places.Autocomplete(input as HTMLInputElement);
      autocomplete.bindTo('bounds', AppConfig.map);
      autocomplete['setFields']( PLACES_SERVICE_FIELDS.getDetails.BASIC );
      const done = autocomplete.addListener('place_changed', ()=>{
        // WARNING: handle_blur() fires BEFORE 'place_changed'
        const place = autocomplete.getPlace();
        console.log('>>> autocomplete, place=', place);
        this.handle_addPlaceResultMarker(place);
      })
      return this.autocomplete = {
        instance: autocomplete,
        detach: ()=>{
          google.maps.event.removeListener(done);
          google.maps.event.clearInstanceListeners(autocomplete);
          const remove = document.querySelector('.pac-container');
          if (remove) remove.remove();
        }
      };
    }
  }


  /**
   * called by  Autocomplete.(place_changed), skips (ionBlur)
   * @param place 
   */
  async handle_addPlaceResultMarker(place?:google.maps.places.PlaceResult){
    const search = this.stash.search;
    const value = search.value;
    
    if (this.autocomplete && place) {
      const loading = await this.loadingController.create({
        duration: 5*1000
      });
      await loading.present();

      const child:IMarker = GmPlaces.formatAsMarker(place);
      (child as IRestMarker)._rest_action = "post";
      // => HomePage.createMarkerGroup_fromMarker(change)
      this.markerChange.emit({data:child, action:"add"});
      
      
      setTimeout( ()=>{
        // WARNING: PlaceResultMarker is rendering with delay. why????
        this.reset();
        loading.dismiss();
      }, 1000);
      return 
    }

  }

  reset(){
    this.stash.search.value = '';
    this.stash.enableCreateMarkerLink = false;
    if (this.autocomplete){ 
      this.autocomplete.detach();
      this.autocomplete = null;
    }
    this.cd.detectChanges();
    this.cd.markForCheck();
  }

}
