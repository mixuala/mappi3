import { Component, OnInit, Input, Renderer2, ElementRef, Inject, ViewEncapsulation,
  SimpleChange, EventEmitter, Output, ChangeDetectionStrategy,
} from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { DOCUMENT } from '@angular/platform-browser';
import { Plugins } from '@capacitor/core';
import { GoogleMapsReady } from '../providers/mappi/google-maps-ready';
import { MappiService, ListenerWrapper,
  quickUuid, MappiMarker,
} from '../providers/mappi/mappi.service';
import * as mappi from '../providers/mappi/mappi.types';

import  { MockDataService, IMarkerGroup,  IPhoto, IMarker } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { MarkerItemComponent } from '../marker-item/marker-item.component';


const { Geolocation } = Plugins;

@Component({
  selector: 'app-google-maps',
  templateUrl: './google-maps.component.html',
  styleUrls: ['./google-maps.component.scss'],
  // BUG: component does not import styleUrls unless `ViewEncapsulation.None`
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleMapsComponent implements OnInit {

  @Input('apiKey') apiKey: string;
  @Input() items: mappi.IMappiMarker[];
  @Input() mode: string;
  

  @Input() selected:string;
  

  @Output() mapReady: EventEmitter<{map:google.maps.Map,key:string}> = new EventEmitter<{map:google.maps.Map,key:string}>();
  @Output() itemChange: EventEmitter<{data:mappi.IMappiMarker,action:string}> = new EventEmitter<{data:mappi.IMappiMarker,action:string}>();
  @Output() selectedChange: EventEmitter<string> = new EventEmitter<string>();


  public static map: google.maps.Map;
  public static currentLoc: google.maps.LatLng;

  public map: google.maps.Map;
  public markers: any[] = [];
  private _mapSDKReady: Promise<void>;
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
      this._mapSDKReady = new Promise( (resolve, reject)=> {
        this.mapReadyResolvers = [resolve, reject];
      })
    )
    Promise.all(loading)
    .then( ()=>this.onMapReady() );
     
  }

  ngOnInit() {
    new GoogleMapsReady(this.apiKey, this.renderer, this._document).init()
    .then(() => {
      return this.loadMap(false);
    }, (err) => {
      console.log(err);
      this.mapReadyResolvers[1]("Could not initialize Google Maps");
    })
    .then( (map:google.maps.Map)=> {
      console.warn("> GoogleMapsComponent ngOnInit, map.id=", this.map['id']);
      this.mapReadyResolvers[0](true);
    });
  }

  ngOnDestroy() {
    google.maps.event.clearInstanceListeners(this.map);
    return;

    /**
     * hide google.maps.Map DOM element offscreen, reuse later
     * BUG: this doesn't seem to work with ios
     */
    this.stash_GoogleMap(this.map);
  }

  private loadMap(force?:boolean): Promise<google.maps.Map> { 
    const mapOptions:google.maps.MapOptions = {
      zoom: 15
    };
    return new Promise((resolve, reject) => {
      if (!force && GoogleMapsComponent.map) {
        this.map = this.stash_GoogleMap();  // unstash
        if (GoogleMapsComponent.currentLoc) {
          mapOptions.center = GoogleMapsComponent.currentLoc;
        }
        
        setTimeout( ()=>{
          this.map.setOptions(mapOptions);
          console.log(">>> TIMEOUT mapZoom", this.map.getZoom());
        },10)
        return resolve(this.map);
      }      

      // get map center then resolve
      this.getCurrentPosition()
      .then ( (position)=>{
        mapOptions.center = position;
        this.map = new google.maps.Map(this.element.nativeElement, mapOptions);
        this.map['id'] = this.map['id'] || `gmap-${Date.now() % 99}`;
        return resolve(this.map);
      });
    });
  }

  getCurrentPosition():Promise<google.maps.LatLng> {
    if (GoogleMapsComponent.currentLoc)
      return Promise.resolve(GoogleMapsComponent.currentLoc);

    return Geolocation.getCurrentPosition()
    .then(
      (position) => {
        console.log(position);
        return GoogleMapsComponent.currentLoc = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
      }, 
      (err) => {
        if (err.message.startsWith("Origin does not have permission to use Geolocation")) {
          console.warn("Geolocation error, using test data");
          const position = {latitude: 3.1581906, longitude: 101.7379296};
          GoogleMapsComponent.currentLoc = new google.maps.LatLng(position.latitude, position.longitude);
          return Promise.resolve(GoogleMapsComponent.currentLoc);
        }
        console.error(err);
        Promise.reject('GoogleMapsComponent: Could not initialise map.');
    })
  }


  /**
   * move google.maps.Map instance/dom offscreen onDestroy, 
   * reuse in onInit
   * @param map google.maps.Map, stash map if provided, otherwise restore
   */
  private stash_GoogleMap(map?:google.maps.Map):google.maps.Map {
    let parent = this.element.nativeElement;
    let stash = document.getElementById('stash-google-maps');
    if (!stash) {
      stash = this.renderer.createElement('DIV');
      stash.id = 'stash-google-maps';
      // stash.style.display = "none";
      stash.style.visibility = "hidden";
      this.renderer.appendChild(this._document.body, stash);
    }

    if (map) {
      // stash map
      GoogleMapsComponent.map = map;
      while (parent.childNodes.length > 0) {
        stash.appendChild(parent.childNodes[0]);
      }
      // NOTE: clearing listeners here disables map UI components on restore
      // google.maps.event.clearInstanceListeners(this.map);
      return null;

    } else {

      // restore stashed map to current GoogleMapComponent.element.nativeElement
      while (parent.childNodes.length > 0) {
        // remove loading spinner, etc.
        parent.removeChild(parent.childNodes[0]);
      }
      while (stash.childNodes.length > 0) {
        parent.appendChild(stash.childNodes[0]);
      }
      return GoogleMapsComponent.map;
    }
  }

  public onMapReady():void {
    this.mapReady.emit({map:this.map, key:this.apiKey});
    this.mgCollection$ = this._mgSub.get$();
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
        case 'selected':
          // see: https://stackoverflow.com/questions/19296323/google-maps-marker-set-background-color?noredirect=1&lq=1
          // see: maps.google.com/mapfiles/marker" + letter + ".png 
          //      e.g. http://maps.google.com/mapfiles/markerB.png
          const visible = MappiMarker.markers.filter(o=>o['_rest_action']!='delete');
          visible.forEach( (m)=>{
            m.setLabel({
              text: m.getLabel().text,
              color: m.uuid == this.selected ? 'black' : 'darkred',
              fontWeight: m.uuid == this.selected ? '900' : '400',
            });
            // if (m.uuid == this.selected) {
            //   // BUG: animation does NOT include labels
            //   // see: https://stackoverflow.com/questions/32725387/google-maps-api-why-dont-labels-animate-along-with-markers
            //   m.setAnimation(google.maps.Animation.BOUNCE);
            //   setTimeout( ()=>m.setAnimation(null), 3000);
            // }
          });
          break;
        case 'items':
          if (change.firstChange) {
            // console.warn(">>> firstChange marker count=", change.currentValue.length);
            // return;
          }
          this._mapSDKReady
          .then( ()=>{
            let items:IMarker[] = change.currentValue;
            // console.warn("*** items marker count=", change.currentValue.length);
            var gm = this.map;
            items.forEach( (m,i)=>m.seq=i);  // reindex for labels
            // ignore markers that are marked for delete pending commit
            const visible = items.filter(o=>o['_rest_action']!='delete');
            const visibleUuids = visible.map(o=>o.uuid);
            // const markerUuids = MappiMarker.markers.map(o=>o.uuid);
            const hidden = MappiMarker.markers.filter(o=>!visibleUuids.includes(o.uuid));
            visible.forEach( (marker,i)=>{
              const mm:mappi.IMappiMarker = marker;
              this.addOneMarker(marker);
            })
            MappiMarker.hide(hidden);

            if (visible.length) this.setMapBoundsWithMinZoom(visible);
          })
          break;
      }
    });
  }

  public setMapBoundsWithMinZoom(markers:IMarker[], minZoom=15){
    // adjust google.maps.LatLngBounds
    const bounds = new google.maps.LatLngBounds(null);
    markers.forEach(o=>{
      // console.log("bounds.extend()", MappiMarker.position(o))
      bounds.extend(MappiMarker.position(o));
    });
    console.log(`* bounds.extend, count=${markers.length}, bounds=`, bounds)

    // This is needed to set the zoom after fitbounds, 
    // begin with zoom=15
    let initialZoom = true;
    const listen_zoom = google.maps.event.addListener(this.map, 'zoom_changed', ()=>{
      google.maps.event.addListenerOnce(this.map, 'bounds_changed', (event)=> {
        // console.log("*** map.zoom=", this.map.getZoom());
        if (this.map.getZoom() > minZoom && initialZoom == true) {
            // Change max/min zoom here
            this.map.setZoom(minZoom);
            initialZoom = false;
            console.warn("**** MapBounds minZoom fired, count=", markers.length)
        }
      });
    });
    const padding= {left:60, right:60, top:40, bottom:40};
    this.map.fitBounds(bounds,padding);
    setTimeout( ()=>{listen_zoom.remove()}, 2000)
  }

  public addOneMarker(mm:mappi.IMappiMarker): void {
    const self = this;
    const found = MappiMarker.markers.find( o=>o.uuid==mm.uuid);
    if (found) {
      mm.marker = found;
      mm.marker.setMap(self.map);
      mm.marker.setLabel({
        text:`${mm.seq+1}`,
        color: mm.uuid == self.selected ? 'black' : 'darkred',
        fontWeight: mm.uuid == self.selected ? '900' : '400',
      });
      return;
    } 
    else {
      const position = MappiMarker.position(mm);
      mm.marker = MappiMarker.make(mm.uuid, {        
        map: self.map,
        // animation: google.maps.Animation.BOUNCE,
        draggable: true,
        position: position,
        // label: `${mm.seq+1}`
        label: {
          text:`${mm.seq+1}`,
          color: mm.uuid == self.selected ? 'black' : 'darkred',
          fontWeight: mm.uuid == self.selected ? '900' : '400',
        }
      });
      mm.marker._listeners = mm.marker._listeners || {};
      mm.marker._listeners.dragend = self.listen_DragEnd(mm);
      mm.marker._listeners.click = self.listen_Click(mm);
    }
  }

  public addMarkers(items:mappi.IMappiMarker[]){
    // const newItems = MappiMarker.except(items.map(o=>o.marker));
    items.forEach( (v,i)=>{
      if (v.marker) {
        v.marker.setMap(this.map);
        v.marker.setLabel({
          text:`${i+1}`,
          color: v.uuid == this.selected ? 'black' : 'darkred',
          fontWeight: v.uuid == this.selected ? '900' : '400',
        })
        return;
      }  
      this.addOneMarker(v);
    })
  }
 

  public listen_Click(m:mappi.IMappiMarker):mappi.IListenerController{
    const click_Marker = ListenerWrapper.make( ()=>{
      return m.marker.addListener('click',(ev)=>{
  
        this.selectedChange.emit(m.uuid);
        
        console.log("marker clicked: label=", m.marker.getLabel().text, m.uuid);
  
      })
    })(true);  
    return click_Marker;
  }  

  public listen_DragEnd(m:mappi.IMappiMarker):mappi.IListenerController{
    const dragend_Marker = ListenerWrapper.make( ()=>{
      return m.marker.addListener('dragend',(ev)=>{
        console.log("marker dragged to", m.marker.getPosition().toJSON());
  
        MappiMarker.moveItem(m, m.marker);
        this.itemChange.emit({data:m, action:'update'}); 
        // => handled by HomePageComponent.mappMarkerChange()
  
      })
    })(true);  
    return dragend_Marker;
  }


  public clearMarkers() : void {
    MappiMarker.reset();
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
    MappiMarker.hide([marker]);
    marker = null;
  }

  private moveItem (item: mappi.IMappiMarker, marker: google.maps.Marker): {lat,lng} {
      MappiMarker.moveItem(item, marker);
      return item.position;
  }
  // END helper methods  

}
