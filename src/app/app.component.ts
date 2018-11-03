import { Component, HostListener, ChangeDetectorRef, } from '@angular/core';
import { Router } from '@angular/router';
import { Platform, Img } from '@ionic/angular';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { Plugins, AppState } from '@capacitor/core';

import { ScreenDim, AppConfig } from './providers/helpers';
import { MockDataService } from './providers/mock-data.service';
import { SubjectiveService } from './providers/subjective.service';
import { ImgSrc } from './providers/photo/imgsrc.service';
import { PhotoService, PhotoLibraryHelper, IMappiLibraryItem } from './providers/photo/photo.service';
import { AppCache, } from './providers/appcache';


const { App, Device, SplashScreen, Storage } = Plugins;


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html'
})
export class AppComponent {
  public appPages = [
    {
      title: 'List',
      url: '/list',
      icon: 'list'
    },
    {
      title: 'Maps',
      url: '/home',
      icon: 'map'
    },
  ];

  @HostListener('window:resize', ['$event'])
  onResize(ev?:any) {
    ScreenDim.set();
  }

  constructor(
    private platform: Platform,
    private statusBar: StatusBar,
    private router: Router,
    private dataService: MockDataService,
    private photoService: PhotoService,
    private cd: ChangeDetectorRef,
  ) {
    this.initializeApp();
  }

  async reset(raw:string){
    Storage.clear();
    AppCache.for('ImgSrc').reset();
    AppCache.for('Cameraroll').reset();
    ImgSrc.reset();  // deprecate
    await this.dataService.loadDatasources(raw);

    const menu = document.querySelector('ion-menu-controller');
    menu.close();
    this.cd.detectChanges();
    setTimeout(  ()=>{
      this.router.navigate(['/list']);
    }, 500 )
  }

  exposeDebug(){
    // Static classes
    window['_MockDataService'] = MockDataService;
    window['_SubjectiveService'] = SubjectiveService;
    window['_PhotoLibraryHelper'] = PhotoLibraryHelper;
    window['_ImgSrc'] = ImgSrc;
    window['_AppCache'] = AppCache;
    window['_AppConfig'] = AppConfig;
  }

  async listenAppState(){
    const device = await Device.getInfo();
    AppConfig.device = device;
    AppConfig.detectBrowser(device);
    switch (device.platform){
      case 'ios':
      case 'android':
        // reset caches, currently not put in Storage
        App.addListener('appStateChange', (state: AppState) => {
          // state.isActive contains the active state
          console.log('&&& App state changed. active=', state.isActive);
          ImgSrc.handleAppStateChange(state);
        });
        break;
    } 
  }

  async initializeApp() {
    AppCache.init();

    await this.platform.ready().then( async() => {
      AppConfig.platform = this.platform;
      this.statusBar.styleDefault();
      SplashScreen.hide().catch((err)=>{});
      await this.listenAppState();
      this.exposeDebug();
    })

    if (AppConfig.device.platform !='ios') {
      return;
    }  
    // warm up cache by preloading cameraroll and moments
    setTimeout( async ()=>{
      this.photoService.load_PhotoLibraryByChunk(1000,100);
    }, 2000 );

    setTimeout( async ()=>{
      const moments = await this.photoService.scan_moments_PhotoLibrary_Cordova({daysAgo:90})
      moments.forEach( m=>{
        m.itemIds.forEach( itemId=>{
          AppCache.for('Moment').set(m, itemId);  // set back ref
        });
      });

    },5000);
    
  }
}
