import { Component, OnInit, Input, Renderer2, ElementRef, Inject, ViewEncapsulation } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { Plugins } from '@capacitor/core';
import { readElementValue } from '@angular/core/src/render3/util';
import { GoogleMapsReady } from '../providers/mappi/google-maps-ready';
import { MappiService, ListenerWrapper,
  quickUuid, MappiMarker,
} from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';


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

  public map: any;
  public markers: any[] = [];
  private mapsLoaded: boolean = false;
  private networkHandler = null;

  constructor(
    public mappi:MappiService,
    private renderer: Renderer2, 
    private element: ElementRef, 
    @Inject(DOCUMENT) private _document,
  ) {

  }

  ngOnInit() {
    new GoogleMapsReady(this.apiKey, this.renderer, this._document).init()
    .then((res) => {
      return this.loadMap()
    }, (err) => {
      console.log(err);
    })
    .then( 
      ()=> this.onMapReady()
    );
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
        reject('Could not initialise map');
      });
    });
  }

  public onMapReady():void {
    // listen for (click)="add Marker"
    this.click_AddMarker(true);

  }

  public addMarker(lat: number, lng: number): void {
    let latLng = new google.maps.LatLng(lat, lng);
    let marker = new google.maps.Marker({
      map: this.map,
      animation: google.maps.Animation.DROP,
      position: latLng
    });
    this.markers.push(marker);
  }

  public clearMarkers() : void {
    // const markers = UuidMarkerFactory.prototype.markers;
    const markers = MappiMarker.markers;
    markers.forEach(m => {
      m.setMap(null);
    });
    // UuidMarkerFactory.prototype.remove(markers)
    MappiMarker.remove(markers);
  }


  public click_AddMarker : (listen:boolean)=>void = (listen:boolean)=>{
    // closure
    const self = this;
    const addMarkerOnClick:(e:any)=>void = (ev:any) => {
      let position:google.maps.LatLng = ev["latLng"];
      const uuid = quickUuid();
      // let marker = UuidMarkerFactory(uuid, {
      let marker = MappiMarker.make(uuid, {        
        map: self.map,
        // animation: google.maps.Animation.BOUNCE,
        draggable: true,
        position: position,
      });

      const item:mappi.IMappiMarker = {
        uuid: marker.uuid,
        loc: [position.lat() as number, position.lng() as number],
        locOffset: [0,0],
      }      




      const dblclick_RemoveMarker = ListenerWrapper.make( ()=>{
        return marker.addListener('dblclick',(ev)=>this.removeMarker(marker) )
      })


      const dragend_AddMarker = ListenerWrapper.make( ()=>{
        return marker.addListener('dragend',(ev)=>{
          console.log("marker dragged to", marker.getPosition().toJSON());

          MappiMarker.moveItem(item, marker);

          dblclick_RemoveMarker(true);
        })
      })(true);

      // const greenMarkerIcon = new google.maps.Icon({
      //   url: place.icon,
      //   size: new google.maps.Size(71, 71),
      //   origin: new google.maps.Point(0, 0),
      //   anchor: new google.maps.Point(17, 34),
      //   scaledSize: new google.maps.Size(25, 25)
      // });
      
      self.markers.push(marker);
      // TODO: EventEmitter<google.maps.Marker>
      console.log(position.toJSON())
      return Promise.resolve(marker);
    }
    const helper = ListenerWrapper.make( 
      ()=>{
          return google.maps.event.addListener(self.map, "click", addMarkerOnClick);
        } 
      )
    return helper(listen);
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
