import { Component, HostListener, ChangeDetectorRef, } from '@angular/core';
import { Router } from '@angular/router';
import { Platform, ModalController, } from '@ionic/angular';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { Plugins, AppState } from '@capacitor/core';
import { ScreenDim, AppConfig } from './providers/helpers';
import { MockDataService } from './providers/mock-data.service';
import { SubjectiveService } from './providers/subjective.service';
import { ImgSrc } from './providers/photo/imgsrc.service';
import { PhotoService, PhotoLibraryHelper,  } from './providers/photo/photo.service';
import { AppCache, } from './providers/appcache';
import { HelpComponent } from './providers/help/help.component';



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
      title: 'Favorites',
      url: '/favorites',
      icon: 'heart'
    },
    {
      title: 'Cameraroll',
      url: '/cameraroll',
      icon: 'images'
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
    private modalCtrl: ModalController,
    private cd: ChangeDetectorRef,
  ) {
    this.initializeApp();
    this.patch_PWA_bootstrap();
  }

  async reset(raw?:string){
    Storage.clear();
    AppCache.for('ImgSrc').reset();
    AppCache.for('Cameraroll').reset();
    await this.dataService.loadDatasources(raw);

    const menu = document.querySelector('ion-menu-controller');
    menu.close();
    this.cd.detectChanges();
    setTimeout(  ()=>{
      this.router.navigate(['/list'], {replaceUrl: true});
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
    window['_Storage'] = Storage;


    window['_loadCameraroll'] = ()=>{
      setTimeout( async ()=>{
        this.photoService.load_PhotoLibraryByChunk(3000);
      }, 1000 );
    }


  }

  async patch_PWA_bootstrap(){
    const RELOAD_LIMIT = 5000
    const el = document.getElementsByTagName('HTML')[0];
    const now = Date.now();
    if (el.classList.contains('plt-pwa')){
      const resp = await Storage.get({key:'PWA_RELOAD'});
      if ( now - JSON.parse(resp.value) < RELOAD_LIMIT) 
        return;  // wait at  before next reload

      const cancel = setTimeout( async ()=>{
        // something not bootstrapping correctly with pwa.  reload() fixes
        await Storage.set({key:'PWA_RELOAD', value:JSON.stringify(now)});
        window.location.reload();
      },100)
    }
  }

  async listenAppState(){
    const device = await Device.getInfo();
    AppConfig.device = device;
    AppConfig.detectBrowser(device);
    switch (device.platform){
      case 'ios':
      case 'android':
        this.patch_PWA_bootstrap();
        // reset caches, currently not put in Storage
        App.addListener('appStateChange', (state: AppState) => {
          // state.isActive contains the active state
          console.log('&&& App state changed. active=', state.isActive);
          ImgSrc.handleAppStateChange(state);
          AppCache.handleAppStateChange(state);
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
      HelpComponent.presentModal(this.modalCtrl, {template:'intro'});
    })

    if (AppConfig.device.platform !='ios') {
      return;
    }  
    // warm up cache by preloading cameraroll and moments
    setTimeout( async ()=>{
      // cameraroll
      const items = await PhotoLibraryHelper.loadCamerarollFromCache();
      let count = AppCache.for('Cameraroll').items().length;
      console.log(`### Cameraroll items restored from Storage, count=${count}`);
      if (count < 999) {
        this.photoService.load_PhotoLibraryByChunk(3000);
      }
      // moments
      const moments = await this.photoService.scan_moments_PhotoLibrary_Cordova({daysAgo:90})
    }, 5000);
    setTimeout( ()=>ImgSrc.retryBroken(), 3000);
    
  }
}
