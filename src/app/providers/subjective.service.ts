import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { takeUntil,  map } from 'rxjs/operators';

import { RestyService } from './resty.service';

@Injectable({
  providedIn: 'root'
})
export class SubjectiveService<T> {

  public readonly className:string;
  public subject$: BehaviorSubject<T[]>;
  public resty: RestyService<T>;
  private _observable$: Observable<T[]>;

  constructor(resty:RestyService<T>) {
    this.className = resty.className;
    this.resty = resty;
    this.subject$ = new BehaviorSubject<T[]>([]);
    this._observable$ = this.subject$.pipe( SubjectiveService.sortBySeq );
   }

  static sortBySeq = map( (v:any[],j)=>{
    if (!v) return v;
    v.sort( (a,b)=>a.seq-b.seq )
    return v;
  })

  // see: https://coryrylan.com/blog/angular-async-data-binding-with-ng-if-and-ng-else
  get$( uuid?:string | string[]): Observable<T[]> {
    if (uuid=="current") {
      return this._observable$;
    }
    else {
      this.resty.get(uuid)
      .then(arr=>{
        if (['MarkerList', 'MarkerGroup'].includes(this.resty.className)){
          arr.sort( (a,b)=>a['label']>b['label'] ? 1:-1 );
          arr.forEach( (o,i)=>o['seq']=i);
        }
        // arr.map( (o,i,l)=>{
        //   // HACK: persist alpha sort/.seq to original data
        //   this.resty["_data"][o['uuid']]=Object.assign({},o);
        // });
        this.subject$.next(arr);
      })
    }
  
    return this._observable$;
  }
  next( items:T[] ){
    items.sort( (a,b)=>a['seq']-b['seq'] );
    this.subject$.next(items);
  }
  value() {
    return this.subject$.value.slice();  // return a copy
  }
  
  repeat() {
    this.subject$.next(this.value());
  }
  
  reload(ids?:any[]):Promise<T[]>{
    if (!ids) {
      ids = this.subject$.value.map( o=>o['uuid'] );
    } 
    return this.resty.get(ids)
    .then( arr=>{
      arr.sort( (a,b)=>a['seq']-b['seq'] ).forEach((o,i)=>o['seq']=i);
      this.next(arr);
      return arr
    });
  }
  // deprecate, use watch$()
  observe$():Observable<T[]> {
    return this._observable$;
  }
  watch$():Observable<T[]> {
    return this._observable$;
  }


}

