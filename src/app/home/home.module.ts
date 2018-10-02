import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { QRCodeModule } from 'angularx-qrcode';

import { HomePage } from './home.page';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';
import { MarkerGroupComponent } from '../marker-group/marker-group.component';
import { MarkerItemComponent } from '../marker-item/marker-item.component';
import { MarkerGroupFocusDirective } from '../marker-group/marker-group-focus.directive';
import { PhotoswipeComponent } from '../photoswipe/photoswipe.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild([
      {
        path: '',
        component: HomePage
      }
    ]),
    QRCodeModule
  ],
  declarations: [HomePage,
    GoogleMapsComponent,
    MarkerGroupComponent, MarkerItemComponent, 
    MarkerGroupFocusDirective, PhotoswipeComponent,
  ],
})
export class HomePageModule {}
