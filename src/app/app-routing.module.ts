import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full'
  },
  {
    path: 'list',
    loadChildren: './list/list.module#ListPageModule'
  },  
  {
    path: 'home/:uuid',
    loadChildren: './home/home.module#HomePageModule'
  },
  { path: 'home',   redirectTo: 'list',   pathMatch: 'full' },  
  { path: 'map/:uuid', loadChildren: './share/share.module#SharePageModule' },
  { path: 'map',   redirectTo: 'list',   pathMatch: 'full' }, 
];

// see: https://forum.ionicframework.com/t/ionic-4-event-to-trigger-navigation-back-to-page/141676/2
export interface IViewNavEvents {
  viewWillEnter?:()=>void,
  viewWillLeave?:()=>void,
}

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
