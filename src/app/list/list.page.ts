import { Component, OnInit, Input, Output,
  OnChanges,  SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject } from 'rxjs';

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
    })

  }

  ngOnInit() {
    this.layout = "default";

    this.mListCollection$ = this._mListSub.get$();
    this.mListCollection$.subscribe( arr=>{
      console.info(`ListPage mLists, count=`, arr.length);
    });
  }


  viewWillEnter(){
    console.warn("viewWillEnter: ListPage, but MarkerListComponent is not detecting changes");
    setTimeout(()=>this.cd.detectChanges())
    // called when returning to ListPage, 
    // BUT, MarkerListComponent does not call ngOnChanges() or ngOnInit()
  }


  // add back when alpha.4 is out
  // navigate(item) {
  //   this.router.navigate(['/list', JSON.stringify(item)]);
  // }
}
