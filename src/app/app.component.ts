import { Component, HostListener } from '@angular/core';

import { Platform } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { Plugins } from '@capacitor/core';
import { MockDataService } from './providers/mock-data.service';
const { Storage } = Plugins;

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

  public static screenHeight:number;
  public static screenWidth:number;

  @HostListener('window:resize', ['$event'])
  onResize(event?) {
    AppComponent.screenHeight = window.innerHeight;
    AppComponent.screenWidth = window.innerWidth;
    // console.log("screenWidth=", AppComponent.screenWidth);
  }

  constructor(
    private platform: Platform,
    private splashScreen: SplashScreen,
    private statusBar: StatusBar,
    public dataService: MockDataService,
  ) {
    this.initializeApp();
    this.onResize();
  }

  async reset(raw:string){
    Storage.clear();
    await this.dataService.loadDatasources(raw);
    const menu = document.querySelector('ion-menu-controller');
    menu.close();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.statusBar.styleDefault();
      this.splashScreen.hide();
    });
  }
}
