import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule, RouteReuseStrategy, Routes } from '@angular/router';
import { QRCodeModule } from 'angularx-qrcode';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SplashScreen } from '@ionic-native/splash-screen/ngx';
import { StatusBar } from '@ionic-native/status-bar/ngx';
import { PhotoLibrary } from '@ionic-native/photo-library/ngx';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import {
  MappiService
} from './providers/mappi/mappi.service';
import { MarkerListComponent } from './marker-list/marker-list.component';
import { MarkerGroupComponent } from './marker-group/marker-group.component';
import { MarkerItemComponent } from './marker-item/marker-item.component';
import { MarkerGroupFocusDirective } from './marker-group/marker-group-focus.directive';
import { GoogleMapsComponent } from './google-maps/google-maps.component';
import { GoogleMapsHostComponent } from './google-maps/google-maps-host.component';
import { MockDataService } from './providers/mock-data.service';
import { RestyService } from './providers/resty.service';
import { SubjectiveService } from './providers/subjective.service';
import { PhotoService } from './providers/photo/photo.service';
import { PhotoswipeComponent } from './photoswipe/photoswipe.component';
// import { MappiImageComponent } from './mappi-image/mappi-image.component';
import { ImgSrc, DataURLPipe } from './providers/photo/imgsrc.service';




@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
  ],
  declarations: [
    MarkerListComponent,
    MarkerGroupComponent, MarkerGroupFocusDirective,
    MarkerItemComponent,
    GoogleMapsComponent, GoogleMapsHostComponent,
    PhotoswipeComponent,
    DataURLPipe,
    // MappiImageComponent,
  ],
  exports: [
    MarkerListComponent,
    MarkerGroupComponent, MarkerGroupFocusDirective,
    MarkerItemComponent,
    GoogleMapsComponent, GoogleMapsHostComponent,
    PhotoswipeComponent,  
    // MappiImageComponent,
  ],
})
export class SharedComponentModule {}

@NgModule({
  declarations: [AppComponent,
  ],
  exports: [
    AppComponent,
  ],
  entryComponents: [],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule,
    QRCodeModule, SharedComponentModule
  ],
  providers: [
    StatusBar,
    SplashScreen,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    MappiService,
    // RestyService, 
    MockDataService, SubjectiveService,
    PhotoService, PhotoLibrary, ImgSrc
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
