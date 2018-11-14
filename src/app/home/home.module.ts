import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedComponentModule } from '../app.module';
import { HomePage } from './home.page';
import { ConfirmChangesRouteGuard } from './helpers';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild([
      {
        path: '',
        component: HomePage,
        canDeactivate: [ConfirmChangesRouteGuard],
      }
    ]),
    SharedComponentModule,
  ],
  declarations: [HomePage,
  ],
  providers: [
    ConfirmChangesRouteGuard
  ]
})
export class HomePageModule {}
