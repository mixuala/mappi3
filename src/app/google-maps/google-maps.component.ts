import { Component, OnInit, Input, Renderer2, ElementRef, Inject, ViewEncapsulation,
  SimpleChange, EventEmitter, Output,
} from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { DOCUMENT } from '@angular/platform-browser';
import { Plugins } from '@capacitor/core';
import { GoogleMapsReady } from '../providers/mappi/google-maps-ready';
import { MappiService, ListenerWrapper,
  quickUuid, MappiMarker,
} from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';

import  { MockDataService, IMarkerGroup,  IPhoto, } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';


const { Geolocation } = Plugins;

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

  @Output() mapReady: EventEmitter<{map:google.maps.Map,key:string}> = new EventEmitter<{map:google.maps.Map,key:string}>();
  @Output() itemChange: EventEmitter<{data:mappi.IMappiMarker,action:string}> = new EventEmitter<{data:mappi.IMappiMarker,action:string}>();

  public map: any;
  public markers: any[] = [];
  private _mapReady: Promise<void>;
  private mapReadyResolvers: [(value?:any)=>void, (value?:any)=>void];

  /**
   * Subjects/Observables/Subscribers
   */
  private _mgSub: SubjectiveService<IMarkerGroup>;
  public mgCollection$ : Observable<IMarkerGroup[]>;

  constructor(
    public mappi:MappiService,
    private renderer: Renderer2, 
    private element: ElementRef, 
    @Inject(DOCUMENT) private _document,
    public dataService: MockDataService,
  ) {
    const loading:Promise<any>[] = [];
    loading.push(
      this.dataService.ready()
      .then( ()=>{
        this._mgSub = this.dataService.sjMarkerGroups;
      })
    )
    loading.push(
      this._mapReady = new Promise( (resolve, reject)=> {
        this.mapReadyResolvers = [resolve, reject];
      })
    )
    Promise.all(loading)
    .then( ()=>this.onMapReady() );
     
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
    this.mapReady.emit({map:this.map, key:this.apiKey});
    this.mgCollection$ = this._mgSub.get$();
    // this.mgCollection$.subscribe( items=>{
    // })
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
          let items:mappi.IMappiMarker[] = change.currentValue;
          this._mapReady
          .then( ()=>{
            // ignore markers that are marked for delete pending commit
            const visible = items.filter(o=>o['_rest_action']!='delete');
            const visibleUuids = visible.map(o=>o.uuid);
            const markerUuids = MappiMarker.markers.map(o=>o.uuid);
            const actions = {
              'keep': MappiMarker.findByUuid( visibleUuids ),
              'add': visible.filter( v=>!markerUuids.includes( v.uuid )),
              'remove': MappiMarker.markers.filter(o=>!visibleUuids.includes(o.uuid)),
            }
            // console.log(`>>> GoogleMapsComponent.ngOnChanges() called, items.length=${items.length}`, actions);
            MappiMarker.remove(actions.remove);
            this.addMarkers(actions.add);

            if (actions.add.length){
              // adjust google.maps.LatLngBounds
              const bounds = new google.maps.LatLngBounds();
              visible.forEach(o=>{
                bounds.extend(MappiMarker.position(o));
              })
              setTimeout(  ()=> {
                this.map.fitBounds(bounds);
              }, 100);
            }
          })
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
    // const newItems = MappiMarker.except(items.map(o=>o.marker));
    items.forEach( (v)=>{
      if (v.marker) return;
      this.addOneMarker(v);
    })
  }

  public listen_DragEnd(m:mappi.IMappiMarker):mappi.IListenerController{
    const dragend_Marker = ListenerWrapper.make( ()=>{
      return m.marker.addListener('dragend',(ev)=>{
        console.log("marker dragged to", m.marker.getPosition().toJSON());
  
        MappiMarker.moveItem(m, m.marker);
        this.itemChange.emit({data:m, action:'update'});
  
      })
    })(true);  
    return dragend_Marker;
  }


  public clearMarkers() : void {
    MappiMarker.remove(MappiMarker.markers);
  }


  public click_AddMarker : mappi.IListenerController = (listen:boolean)=>{
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
      }
      m.position = MappiMarker.position(m);

      // add marker from HomeComponent using mgCollection$ Observable
      this.itemChange.emit({data:m, action:'add'});
      console.log(Date.now(), 'addMarkerOnClick at', position.toJSON())


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
