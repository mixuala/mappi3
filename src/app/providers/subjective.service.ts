import { Injectable } from '@angular/core';
import { from, of, pipe, merge, Observable, BehaviorSubject } from 'rxjs';
import { catchError,  map , scan, mergeMap} from 'rxjs/operators';

import { RestyService } from './resty.service';

@Injectable({
  providedIn: 'root'
})
export class SubjectiveService<T> {

  public subject$: BehaviorSubject<T[]>;
  public resty: RestyService<T>;

  constructor(resty:RestyService<T>) {
    this.resty = resty;
    this.subject$ = new BehaviorSubject<T[]>([]);
   }

  // see: https://coryrylan.com/blog/angular-async-data-binding-with-ng-if-and-ng-else
  get$( uuid?:string | string[]): Observable<T[]> {
    let sortBySeq = map( (v:any[],j)=>{
      v.sort( (a,b)=>a.seq-b.seq )
      return v;
    })

    this.resty.get(uuid)
    .then(arr=>{
      arr.sort( (a,b)=>a['label']>b['label'] ? 1:-1 );
      arr.map( (o,i)=>o['seq']=i);
      arr.map( (o,i)=>{
        // HACK: persist alpha sort/.seq to original data
        this.resty["_data"][o['uuid']]=Object.assign({},o);
      });
      this.subject$.next(arr);
    })
  
    return this.subject$.pipe( sortBySeq )
  }
  next( items:T[] ){
    items.sort( (a,b)=>a['seq']-b['seq'] );
    this.subject$.next(items);
  }
  value() {
    return this.subject$.value.slice();  // return a copy
  }
  reload(ids?:any[]){
    this.resty.get(ids).then( arr=>this.next(arr));
  }


}

