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
import { SubjectiveService } from './providers/subjective.service';
import { PhotoService } from './providers/photo/photo.service';
import { PhotoswipeComponent } from './photoswipe/photoswipe.component';
import { ImgSrc, DataURLPipe } from './providers/photo/imgsrc.service';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { CamerarollPage } from './cameraroll/cameraroll.page';
import { HelpComponent } from './providers/help/help.component';
import { MarkerAddComponent } from './marker-add/marker-add.component';
import { HttpClientModule } from '@angular/common/http';
import { GeocodeComponent } from './geocode/geocode.component';




@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HttpClientModule,
    ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production }),
  ],
  declarations: [
    MarkerListComponent,
    MarkerGroupComponent, MarkerGroupFocusDirective,
    MarkerItemComponent, MarkerAddComponent,
    GoogleMapsComponent, GoogleMapsHostComponent, GeocodeComponent,
    PhotoswipeComponent,
    DataURLPipe,
    CamerarollPage,
    HelpComponent,
  ],
  entryComponents: [
    CamerarollPage,
    HelpComponent,
    GeocodeComponent,
  ],
  exports: [
    MarkerListComponent,
    MarkerGroupComponent, MarkerGroupFocusDirective,
    MarkerItemComponent, MarkerAddComponent,
    GoogleMapsComponent, GoogleMapsHostComponent, GeocodeComponent,
    PhotoswipeComponent,  
    CamerarollPage,
    HelpComponent,
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
    MockDataService, SubjectiveService,
    PhotoService, PhotoLibrary, ImgSrc
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
