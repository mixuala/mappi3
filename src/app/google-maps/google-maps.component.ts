import { Component, OnInit, Input, Renderer2, ElementRef, Inject, ViewEncapsulation,
  SimpleChange, EventEmitter, Output,
} from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { Plugins } from '@capacitor/core';
import { readElementValue } from '@angular/core/src/render3/util';
import { GoogleMapsReady } from '../providers/mappi/google-maps-ready';
import { MappiService, ListenerWrapper,
  quickUuid, MappiMarker,
} from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';

import  { 
  IMarkerGroup,  IPhoto,
} from '../providers/mock-data.service';


const { Geolocation, Network } = Plugins;

@Component({
  selector: 'app-google-maps',
  templateUrl: './google-maps.component.html',
  styleUrls: ['./google-maps.component.scss'],
  // BUG: component does not import styleUrls unless `ViewEncapsulation.None`
  encapsulation: ViewEncapsulation.None,
})
export class GoogleMapsComponent implements OnInit {

  @Input('apiKey') apiKey: string;
  @Input() items: mappi.IMappiMarker[];
  @Input() mode: string;

  @Output() itemChange: EventEmitter<mappi.IMappiMarker> = new EventEmitter<mappi.IMappiMarker>();

  public map: any;
  public markers: any[] = [];
  public mapReady: Promise<void>;
  private mapReadyResolvers: [(value?:any)=>void, (value?:any)=>void];
  private mapsLoaded: boolean = false;

  constructor(
    public mappi:MappiService,
    private renderer: Renderer2, 
    private element: ElementRef, 
    @Inject(DOCUMENT) private _document,
  ) {
    this.mapReady = new Promise( (resolve, reject)=> {
       this.mapReadyResolvers = [resolve, reject];
    })
  }

  ngOnInit() {
    new GoogleMapsReady(this.apiKey, this.renderer, this._document).init()
    .then((res) => {
      return this.loadMap()
    }, (err) => {
      console.log(err);
      this.mapReadyResolvers[1]("Could not initialize Google Maps");
    })
    .then( ()=> {
      this.onMapReady();
      console.log("> GoogleMapsComponent ngOnInit");
      this.mapReadyResolvers[0](true);
    });
  }

  private loadMap(): Promise<any> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition().then((position) => {
        console.log(position);
        let latLng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        let mapOptions = {
          center: latLng,
          zoom: 15
        };
        this.map = new google.maps.Map(this.element.nativeElement, mapOptions);
        resolve(true);
      }, (err) => {
        console.error(err);
        reject('Could not initialise map. No access to location???');
      });
    });
  }

  public onMapReady():void {
    // listen for (click)="add Marker"
    // this.click_AddMarker(true);
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k,change] = en;
      switch(k){
        case 'mode':
          if (change.firstChange) 
            break;
          const listen = change.currentValue=='edit';
          this.click_AddMarker(listen);
          break;
        case 'items':
          const items = change.currentValue;
          if (!change.firstChange){
            this.mapReady
            .then( ()=>{
              // console.log(`>>> GoogleMapsComponent.ngOnChanges() called, items.length=${items.length}`);
              this.addMarkers(items);
            })
          }
          break;
      }
    });
  }  

  public addOneMarker(m:mappi.IMappiMarker): void {
    const self = this;
    const position = MappiMarker.position(m);
    m.marker = MappiMarker.make(m.uuid, {        
      map: self.map,
      // animation: google.maps.Animation.BOUNCE,
      draggable: true,
      position: position,
    });
    m.listeners = m.listeners || {};
    m.listeners.dragend = this.listen_DragEnd(m);
  }

  public addMarkers(items:mappi.IMappiMarker[]){
    const self = this;
    const newItems = MappiMarker.except(items);
    newItems.forEach( (m:mappi.IMappiMarker)=>{
      this.addOneMarker(m);
    })
  }

  public listen_DragEnd(m:mappi.IMappiMarker):mappi.IListenerController{
    const dragend_Marker = ListenerWrapper.make( ()=>{
      return m.marker.addListener('dragend',(ev)=>{
        console.log("marker dragged to", m.marker.getPosition().toJSON());
  
        MappiMarker.moveItem(m, m.marker);
        this.itemChange.emit(m);
  
      })
    })(true);  
    return dragend_Marker;
  }


  public clearMarkers() : void {
    MappiMarker.remove(MappiMarker.markers);
  }


  public click_AddMarker : mappi.IListenerController   = (listen:boolean)=>{
    // closure
    const self = this;
    const addMarkerOnClick:(e:any)=>void = (ev:any) => {
      const position:google.maps.LatLng = ev["latLng"];
      const m:IMarkerGroup =  {
        id: this.markers.length,
        uuid: quickUuid(),
        seq: this.markers.length, 
        label: null, 
        loc: [position.lat(), position.lng()],
        locOffset:[0,0],
        position: null,
        placeId: null,
        markerItemIds: [],
        markerItems: []
      }
      m.position = MappiMarker.position(m);
      this.addOneMarker(m);
      this.items.push(m);
      this.itemChange.emit(m);



      // const dblclick_RemoveMarker = ListenerWrapper.make( ()=>{
      //   return marker.addListener('dblclick',(ev)=>this.removeMarker(marker) )
      // })

      // const greenMarkerIcon = new google.maps.Icon({
      //   url: place.icon,
      //   size: new google.maps.Size(71, 71),
      //   origin: new google.maps.Point(0, 0),
      //   anchor: new google.maps.Point(17, 34),
      //   scaledSize: new google.maps.Size(25, 25)
      // });
    }
    this.click_AddMarker = ListenerWrapper.make( 
      ()=>{
          return google.maps.event.addListener(self.map, "click", addMarkerOnClick);
        } 
      )
    return this.click_AddMarker(listen);
  }


  // helper methods
  private removeMarker (marker:mappi.IUuidMarker):void {
    MappiMarker.remove([marker]);
    marker = null;
  }

  private moveItem (item: mappi.IMappiMarker, marker: google.maps.Marker): {lat,lng} {
      MappiMarker.moveItem(item, marker);
      return item.position;
  }
  // END helper methods  

}
