import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { takeUntil,  map } from 'rxjs/operators';

import { IPhoto, } from './types';
import { RestyService } from './resty.service';
import { AppCache } from './appcache';

@Injectable({
  providedIn: 'root'
})
export class SubjectiveService<T> {

  /**
  cacheOnlyPhotos(items:T[]){
   * NOTE: cache all T.className=='Photo' in this.get$()
   */
  public static photoCache:{[uuid:string]:IPhoto} = {};

  public readonly className:string;
  public subject$: BehaviorSubject<T[]>;
  public resty: RestyService<T>;
  private _observable$: Observable<T[]>;
  public sortBy:string = 'seq';

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
    const now = Date.now();
    if (uuid=="current") {
      return this._observable$;
    }
    else {
      this.resty.get(uuid)
      .then(arr=>{
        if (['MarkerList'].includes(this.resty.className)){
          this.sortBy = 'label'; // TODO: this doesn't work if a user reorders.
          arr.sort( (a,b)=>a[this.sortBy]>b[this.sortBy] ? 1:-1 ).forEach( (o,i)=>{
            o['seq']=i;
          });
        } else {
          this.sortBy = 'seq';
          if (uuid instanceof Array){
            const orderedUuids = uuid;
            // set o.seq to match sequence of orderedUuids
            arr.forEach( o=>{
              o['seq']=orderedUuids.findIndex( id=>o['uuid']==id);
            });
            arr.sort( (a,b)=>a[this.sortBy]>b[this.sortBy] ? 1:-1 );
          }
        }
        // reindex for Subject only, NOT DB
        this.subject$.next(arr);
        // extras
        this.cacheOnlyPhotos(arr);
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
  
  reload(ids?:any[], sort:boolean=false):Promise<T[]>{
    if (!ids) {
      ids = this.subject$.value.map( o=>o['uuid'] );
    } 
    return this.resty.get(ids)
    .then( arr=>{
      // reindex for Subject only, NOT DB
      if (sort) arr.sort( (a,b)=>a[this.sortBy]>b[this.sortBy] ? 1:-1 ).forEach( (o,i)=>o['seq']=i);
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

  cacheOnlyPhotos(items:T[]){
    if (this.className != 'Photo') return;
    (items as any as IPhoto[]).forEach( o=>{
      AppCache.for('Photo').set(o)
      SubjectiveService.photoCache[o.uuid] = o;
    });
  }


}

