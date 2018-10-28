import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { Platform, Img } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { Plugins, AppState } from '@capacitor/core';

import { ScreenDim } from './providers/helpers';
import { MockDataService } from './providers/mock-data.service';
import { SubjectiveService } from './providers/subjective.service';
import { ImgSrc } from './providers/photo/imgsrc.service';
import { PhotoLibraryHelper } from './providers/photo/photo.service';


const { App, BackgroundTask, Device, Storage } = Plugins;


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
    private splashScreen: SplashScreen,
    private statusBar: StatusBar,
    private router: Router,
    private dataService: MockDataService,
    private imgSrc: ImgSrc,
  ) {
    this.initializeApp();
  }

  async reset(raw:string){
    Storage.clear();
    ImgSrc.reset();
    PhotoLibraryHelper.reset();
    await this.dataService.loadDatasources(raw);

    const menu = document.querySelector('ion-menu-controller');
    menu.close();
    this.router.navigate(['/list']);
  }

  exposeDebug(){
    // Static classes
    window['_MockDataService'] = MockDataService;
    window['_SubjectiveService'] = SubjectiveService;
    window['_PhotoLibraryHelper'] = PhotoLibraryHelper;
    window['_ImgSrc'] = ImgSrc;
  }

  async listenAppState(){
    const device = await Device.getInfo();
    switch (device.platform){
      case 'ios':
      case 'android':
        // reset caches, currently not put in Storage
        App.addListener('appStateChange', (state: AppState) => {
          // state.isActive contains the active state
          console.log('&&& App state changed. Is active?', state.isActive);
          ImgSrc.handleAppStateChange(state);
        });
        break;
    } 
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.statusBar.styleDefault();
      this.splashScreen.hide();
      this.listenAppState();
      this.exposeDebug();
    });
  }
}
