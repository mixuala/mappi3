import { Component, HostListener } from '@angular/core';

import { Platform } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

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
    private statusBar: StatusBar
  ) {
    this.initializeApp();
    this.onResize();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.statusBar.styleDefault();
      this.splashScreen.hide();
    });
  }
}
