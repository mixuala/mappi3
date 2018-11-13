import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { SharedComponentModule } from '../app.module';
import { CamerarollPage } from './cameraroll.page';

const routes: Routes = [
  {
    path: '',
    component: CamerarollPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    SharedComponentModule,
  ],
  exports:[CamerarollPage],
  // declarations: [CamerarollPage]   // declare in SharedComponentModule
})
export class CamerarollPageModule {}
