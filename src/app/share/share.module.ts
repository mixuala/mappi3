import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { QRCodeModule } from 'angularx-qrcode';


import { SharePage } from './share.page';
import { SharedComponentModule } from '../app.module';

const routes: Routes = [
  {
    path: '',
    component: SharePage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    QRCodeModule,
    SharedComponentModule,
  ],
  declarations: [SharePage]
})
export class SharePageModule {}
