import { Component, OnInit, Input, Renderer2, ElementRef, Inject, ViewEncapsulation,
  SimpleChange, EventEmitter, Output, ChangeDetectionStrategy,
} from '@angular/core';
import { Observable, } from 'rxjs';
import { DOCUMENT } from '@angular/platform-browser';
import { Plugins } from '@capacitor/core';

import { ScreenDim, AppConfig } from '../providers/helpers';
import { MappiService, ListenerWrapper, MappiMarker, } from '../providers/mappi/mappi.service';

import { 
  IMarker, IMarkerGroup, 
  IUuidMarker, IMappiMarker, IListenerController, IMapActions,
} from '../providers/types';
import  { MockDataService, RestyTrnHelper } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';


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

  @Input() items: IMappiMarker[];
  @Input() mode: IMapActions = {};
  @Input() selected:string;
  @Input() activeView:boolean = false;

  @Output() itemChange: EventEmitter<{data:IMappiMarker,action:string}> = new EventEmitter<{data:IMappiMarker,action:string}>();
  @Output() selectedChange: EventEmitter<string> = new EventEmitter<string>();
  
  public map: google.maps.Map;
  public markers: any[] = [];
  private _stash:any={};

  /**
   * Subjects/Observables/Subscribers
   */
  private _mgSub: SubjectiveService<IMarkerGroup>;
  public mgCollection$ : Observable<IMarkerGroup[]>;

  constructor(
    public mappi:MappiService,
    public dataService: MockDataService,
  ) {
  }

  async ngOnInit() {
    await AppConfig.mapReady.then( map=>this.map=map);
    // DEV 
    const listen_zoom = google.maps.event.addListener(this.map, 'zoom_changed', ()=>{
      const markers = RestyTrnHelper.getCachedMarkers(this.items, 'visible');
      console.log(`~~~ map zoom=${this.map.getZoom()}, m count=${markers.length}`);
    });
  }

  ngOnDestroy() {
    const count = MappiMarker.remove(this.map);
    // console.warn(`>>> destroy Map ${this.map['id']}, remove markers, count=${count}`);
    // google.maps.event.clearInstanceListeners(this.map);
    return;
  }

  async ngOnChanges(o){
    Object.entries(o).forEach( async (en:[string,SimpleChange])=>{
      let [k,change] = en;
      switch(k){
        case 'mode':
          if (!this.map) return;
          for (const [k,v] of Object.entries(change.currentValue)){
            MappiMarker.find(null, this.map['id']).forEach( m=>{
              // toggle listeners for each key
              if (m._listeners && m._listeners[k]){ 
                m._listeners[k](!!v);
                if (k=='dragend') m.setDraggable(!!v);
              }
            });
            if (k=='clickadd') {
              this.click_AddMarker(!!v);
            }
          } 
          break;
        case 'selected':
          if (!this.map) return;
          // see: https://stackoverflow.com/questions/19296323/google-maps-marker-set-background-color?noredirect=1&lq=1
          // see: maps.google.com/mapfiles/marker" + letter + ".png 
          //      e.g. http://maps.google.com/mapfiles/markerB.png
          const visible = MappiMarker.visible(this.map['id']);
          visible.forEach( (mm)=>{
            mm._marker.setLabel({
              text: mm._marker.getLabel().text,
              color: mm.uuid == this.selected ? 'black' : 'darkred',
              fontWeight: mm.uuid == this.selected ? '900' : '400',
            });
            mm._marker.setZIndex(1);
            if (mm.uuid == this.selected) {
              mm._marker.setZIndex(10);
              // the the SelectedMarker is not clearly visible, one over another, then zoom
              // check distance from Center, then pan if necessary
              const central = MappiMarker.mapCentral(this.map);
              const panToMarker = (central.contains(mm.position) == false);
              if (panToMarker) {
                const target = MappiMarker.panToBounds(this.map, mm.position);
                this.map.panToBounds( target );
              }
            }
            // if (m.uuid == this.selected) {
            //   // BUG: animation does NOT include labels
            //   // see: https://stackoverflow.com/questions/32725387/google-maps-api-why-dont-labels-animate-along-with-markers
            //   m.setAnimation(google.maps.Animation.BOUNCE);
            //   setTimeout( ()=>m.setAnimation(null), 3000);
            // }
          });

          break;
        case 'items':
          await AppConfig.mapReady.then( map=>this.map=map);
          if (this.activeView==false) 
            return; // pause updates

          let items:IMarker[] = change.currentValue;
          this.renderMarkers(items);
          break;
      }
    });
  }

  /**
   * 
   * @param items IMarker[], if null, then skip rendering step
   */
  renderMarkers(items:IMarker[]) {
    var gm = AppConfig.map;
    items.forEach( (m,i)=>m.seq=i);  // reindex for labels
    // ignore markers that are marked for delete pending commit
    const visible = items.filter(o=>o['_rest_action']!='delete');
    const hidden = MappiMarker.except(visible, AppConfig.map['id']);
    MappiMarker.hide(hidden);
    visible.forEach( (marker,i)=>{
      this.addOneMarker(marker as IMappiMarker);
    })

    if (visible.length) {
      // console.warn(`setMapBoundsWithMinZoom: ${this.map['id']}`)
      const minZoom = this.mode['initialZoom'] || ( (items.length == 1) ? 13 : 15 );
      this.setMapBoundsWithMinZoom(visible, minZoom);
    }
  }

  public setMapBoundsWithMinZoom(markers:IMarker[], defaultMinZoom=15){

    const skipBoundsChange = ():boolean=>{
      if (this.mode['resetBounds']===true) return false;
      // if the marker className has not changed, do not change bounds
      // ListPage is listening to 'bounds_change' when activeView==true;
      // TODO: solved by checking for this.activeView in renderMarkers()????
      const shouldSkip = this._stash.markerClassName == markers[0]['className'];
      this._stash.markerClassName = markers[0]['className'];
      return shouldSkip;
    }
    if (skipBoundsChange() )
      return;


    // This is needed to set the zoom after fitbounds, 
    // begin with zoom=15
    let setInitialMapZoom = this.mode['initialZoom'] == undefined;
    const minZoom = Math.max(this.mode['initialZoom'] || defaultMinZoom);

    let _first_zoom_change = true; // mapZoom changes asynchronously
    // TODO:  use Observable.fromEventPattern() with debounceTime/throttleTime???
    const listen_zoom = google.maps.event.addListener(this.map, 'zoom_changed', ()=>{
      google.maps.event.addListenerOnce(this.map, 'bounds_changed', (event)=> {
        if (setInitialMapZoom) this.mode['initialZoom'] = this.map.getZoom();
        console.warn(`*** MapBounds changed, markers=${markers.length}, minZoom=${minZoom}, initialZoom=${this.mode['initialZoom']}`);
        if (this.map.getZoom() > minZoom && _first_zoom_change == true) {
            // Change max/min zoom here
            setTimeout( ()=>this.map.setZoom(minZoom) );
            if (setInitialMapZoom) {
              this.mode['initialZoom'] = minZoom;
            }
            _first_zoom_change = setInitialMapZoom = false;
            console.warn(`*** >>> MapBounds minZoom fired, markers=${markers.length}, minZoom=${minZoom}, initialZoom=${this.mode['initialZoom']}`);
        }
      });
    });
    if (setInitialMapZoom) this.mode['initialZoom'] = Math.max(minZoom , this.map.getZoom());

    const padding= {left:60, right:60, top:40, bottom:40};
    if (this.mode['resetBounds']!==false){
      // adjust google.maps.LatLngBounds, default true
      const bounds = new google.maps.LatLngBounds(null);
      markers.forEach(o=>{
        // console.log("bounds.extend()", MappiMarker.position(o))
        bounds.extend(MappiMarker.position(o));
      });
      console.log(`* bounds.extend, count=${markers.length}, bounds=`, bounds)
      this.map.fitBounds(bounds,padding);  // triggers 'zoom_changed'
    }
    setTimeout( ()=>{listen_zoom.remove()}, 1000)
  }

  public addOneMarker(mm:IMappiMarker): void {
    const self = this;
    const position = MappiMarker.position(mm);
    const mapId = this.map['id'];
    const found = MappiMarker.findByUuid([mm.uuid], mapId);
    if (found.length) {
      mm._marker = found[0];
      mm._marker.setMap(self.map);
      mm._marker.setLabel({
        text:`${mm.seq+1}`,
        color: mm.uuid == self.selected ? 'black' : 'darkred',
        fontWeight: mm.uuid == self.selected ? '900' : '400',
      });
      mm._marker.setPosition(position);
      mm._marker.setDraggable(!!this.mode['dragend']);
      mm._marker._listeners.dragend(!!this.mode['dragend']);
      mm._marker._listeners.click(!!this.mode['click']);
      mm._marker['mapId'] = mapId;
    } 
    else {
      MappiMarker.make(mm, {        
        map: self.map,
        // animation: google.maps.Animation.BOUNCE,
        draggable: (!!this.mode['dragend']),
        position: position,
        // label: `${mm.seq+1}`
        label: {
          text:`${mm.seq+1}`,
          color: mm.uuid == self.selected ? 'black' : 'darkred',
          fontWeight: mm.uuid == self.selected ? '900' : '400',
        }
      }, self.map);
      mm._marker._listeners = mm._marker._listeners || {};
      mm._marker._listeners.dragend = self.listen_DragEnd(mm)(!!this.mode['dragend']);
      mm._marker._listeners.click = self.listen_Click(mm)(!!this.mode['click']);
    }
  }
 

  public listen_Click(mm:IMappiMarker):IListenerController{
    const click_Marker = ListenerWrapper.make( ()=>{
      return mm._marker.addListener('click',(ev)=>{
  
        if (typeof this.mode['click'] != 'boolean'){
          // this.mode['click'](mm);
        } else {
          // default action
          this.selectedChange.emit(mm.uuid);
        }

        console.log("marker clicked: label=", mm._marker.getLabel().text, mm.uuid);
  
      })
    })(true);  
    return click_Marker;
  }  

  public listen_DragEnd(mm:IMappiMarker):IListenerController{
    const dragend_Marker = ListenerWrapper.make( ()=>{
      return mm._marker.addListener('dragend',(ev)=>{
        console.log("marker dragged to", mm._marker.getPosition().toJSON());
  
        if (typeof this.mode['dragend'] != 'boolean'){
          // this.mode['dragend'](mm);
        } else {
          // default action
          MappiMarker.moveItem(mm, mm._marker);
          this.itemChange.emit({data:mm, action:'update'}); 
          // => handled by HomePageComponent.mappMarkerChange()
        }
        
      })
    })(true);  
    return dragend_Marker;
  }


  public clearMarkers() : void {
    MappiMarker.reset();
  }


  public click_AddMarker : IListenerController = (listen:boolean)=>{
    // closure
    const self = this;
    const addMarkerOnClick:(e:any)=>void = (ev:any) => {
      const position:google.maps.LatLng = ev["latLng"];
      const mm = {
        className: 'MappiMarker',
        loc: [position.lat(), position.lng()],
      } as IMappiMarker;

      // add marker from HomeComponent using mgCollection$ Observable
      // => HomePage.mappiMarkerChange() => createMarkerGroup_fromMarker()
      this.itemChange.emit({data:mm, action:'add'});
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
  private removeMarker (marker:IUuidMarker):void {
    MappiMarker.hide([marker]);
    marker = null;
  }

  private moveItem (item: IMappiMarker, marker: google.maps.Marker): {lat,lng} {
      MappiMarker.moveItem(item, marker);
      return item.position;
  }
  // END helper methods  






  /**
   * static map methods
   * 
   */

  // see: https://developers.google.com/maps/documentation/maps-static/dev-guide
  static getStaticMap(map:google.maps.Map, markers:IMarker[] ):string {
    // helper functions
    const round6 = (n:number):number=>Math.round(n*1e6)/1e6
    const mapDim = (fit640?:boolean)=>{
      const MAX_DIM = 640;
      const {width, height} = map.getDiv().getBoundingClientRect();
      const max_dim = Math.min( Math.max( width, height), MAX_DIM);
      let scale = max_dim/Math.max(width,height);
      if (!fit640) scale = Math.min(1, scale);
      return [width,height].map(n=>Math.floor(n*scale));
    }  
    
    const baseurl = "https://maps.googleapis.com/maps/api/staticmap?";
    const markerSyles={
      size: 'mid',
      color: 'green',
    }
    const markerSpec = []
    markers.forEach( (m,i)=>{
      const {lat, lng} = m.position;
      markerSyles['label'] = i+1;
      const marker = [
        Object.entries(markerSyles).map( el=>el.join(':') ).join('%7C'),
        [lat,lng].map( n=>round6(n) ).join(','),
      ]
      markerSpec.push(marker.join('%7C'));
    })

    const params = {
      center: map.getCenter().toUrlValue(),
      zoom: map.getZoom(),
      size: mapDim().join('x'), // '512x512',
      scale:2,
      mapType: map.getMapTypeId(),
      markers: markerSpec.join('&markers='),
      key: AppConfig.mapKey
    }
    // console.log(params);
    // console.log(markerSpec);
    const url = baseurl + Object.entries(params).map( el=>el.join('=') ).join('&');
    console.log(url); 
    return url;
  }



}
