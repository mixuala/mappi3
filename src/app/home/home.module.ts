import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { HomePage } from './home.page';
import { GoogleMapsComponent } from '../google-maps/google-maps.component';
import { MarkerGroupComponent } from '../marker-group/marker-group.component';
import { MarkerItemComponent } from '../marker-item/marker-item.component';
import { MarkerGroupFocusDirective } from '../marker-group/marker-group-focus.directive';

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
    ])
  ],
  declarations: [HomePage,
    GoogleMapsComponent,
    MarkerGroupComponent, MarkerItemComponent, 
    MarkerGroupFocusDirective,
  ],
})
export class HomePageModule {}
