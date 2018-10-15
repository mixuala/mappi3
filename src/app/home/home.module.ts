import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { QRCodeModule } from 'angularx-qrcode';

import { SharedComponentModule } from '../app.module';
import { HomePage } from './home.page';

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
    // QRCodeModule,
    SharedComponentModule,
  ],
  declarations: [HomePage,
  ],
})
export class HomePageModule {}
