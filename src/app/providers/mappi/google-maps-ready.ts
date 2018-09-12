import { Renderer2, ElementRef, Inject } from '@angular/core';

import { Plugins } from '@capacitor/core';

const { Network } = Plugins;


/**
 * Helper class to inject google maps JS SDK
 * see: https://www.joshmorony.com/using-google-maps-and-geolocation-in-ionic-with-capacitor/
 * 
 * usage:
    new GoogleMapsReady(apiKey, renderer, document).init()
    .then( ()=>{
      loadMap()
    })
 */
export class GoogleMapsReady {

  private mapsLoaded: boolean = false;
  private networkHandler = null;

  constructor(
    private apiKey: string,
    private renderer: Renderer2, 
    private _document: any,
  ){  }

  public init(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.loadSDK()
      .then( () =>{
        console.log("Google Maps ready.");
        resolve(true);
      },
      (err) => {
        console.error("GoogleMapsReady.init(): error loading google maps SDK")
        reject(err);
      });
    });
  }
  
  private loadSDK(): Promise<any> {
    console.log("Loading Google Maps SDK");
    return new Promise((resolve, reject) => {
      if (!this.mapsLoaded) {
        Network.getStatus().then((status) => {
          if (status.connected) {
            this.injectSDK().then((res) => {
              resolve(true);
            }, (err) => {
              reject(err);
            });
          } else {
            if (this.networkHandler == null) {
              this.networkHandler = Network.addListener('networkStatusChange', (status) => {
                if (status.connected) {
                  this.networkHandler.remove();
                  this.init().then((res) => {
                    console.log("Google Maps ready.")
                  }, (err) => {
                    console.log(err);
                  });
                }
              });
            }
            reject('Not online');
          }
        }, (err) => {
          // NOTE: navigator.onLine temporarily required until Network plugin has web implementation
          if (navigator.onLine) {
            this.injectSDK().then((res) => {
              resolve(true);
            }, (err) => {
              reject(err);
            });
          } else {
            reject('Not online');
          }
        });
      } else {
        reject('SDK already loaded');
      }
    });

  }

  private injectSDK(): Promise<any> {
    return new Promise((resolve, reject) => {
      window['mapInit'] = () => {
        this.mapsLoaded = true;
        resolve(true);
      }
      let script = this.renderer.createElement('script');
      script.id = 'googleMaps';
      if (this.apiKey) {
        script.src = 'https://maps.googleapis.com/maps/api/js?key=' + this.apiKey + '&callback=mapInit';
      } else {
        script.src = 'https://maps.googleapis.com/maps/api/js?callback=mapInit';
      }
      this.renderer.appendChild(this._document.body, script);
    });
  }






}