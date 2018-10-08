import { Component, OnInit, Input, Output,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { Observable, BehaviorSubject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

import { IViewNavEvents } from "../app-routing.module";
import  { 
  MockDataService,
  IMarker, IMarkerGroup, IPhoto, IMarkerList
} from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';



@Component({
  selector: 'app-list',
  templateUrl: 'list.page.html',
  styleUrls: ['list.page.scss']
})
export class ListPage implements OnInit {
  
  public layout: string;
  public mListCollection$ : Observable<IMarkerList[]>;
  public toggle:any = {};

  private _mListSub: SubjectiveService<IMarkerList>;
  

  constructor( 
    public dataService: MockDataService,
    private router: Router,
    private cd: ChangeDetectorRef,
  ){
    this.dataService.ready()
    .then( ()=>{
      this._mListSub = this.dataService.sjMarkerLists;
    });

    this.router.events
    .pipe( filter( (e:Event)=>e instanceof NavigationStart) )
    .subscribe( (e: NavigationStart)=>console.log("routingDestination", e.url) );

  }

  ngOnInit() {
    this.layout = "default";

    this.mListCollection$ = this._mListSub.get$();
    this.mListCollection$.subscribe( arr=>{
      console.info(`ListPage mLists, count=`, arr.length);
    });
    
  }


  viewWillEnter(){
    console.warn("viewWillEnter: ListPage");
    // setTimeout(()=>this.cd.detectChanges())
    // called when returning to ListPage, 
  }

  viewWillLeave(){
    console.warn("viewWill-Leave: ListPage");
    // called when navigating to HomePage, 
  }

}
