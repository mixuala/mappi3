import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule, RouteReuseStrategy, Routes } from '@angular/router';
import { QRCodeModule } from 'angularx-qrcode';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import {
  MappiService
} from './providers/mappi/mappi.service';
import { MockDataService } from './providers/mock-data.service';
import { RestyService } from './providers/resty.service';
import { SubjectiveService } from './providers/subjective.service';


@NgModule({
  declarations: [
    AppComponent, 
  ],
  entryComponents: [],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule,
    QRCodeModule],
  providers: [
    StatusBar,
    SplashScreen,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    MappiService,
    MockDataService, RestyService, SubjectiveService
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
