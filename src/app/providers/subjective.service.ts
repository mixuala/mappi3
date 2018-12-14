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

  public readonly className:string;
  public subject$: BehaviorSubject<T[]>;
  public resty: RestyService<T>;
  protected _observable$: Observable<T[]>;
  protected _id2seq:{[uuid:string]:number};
  public modified:number;   // time of last resty.get()

  constructor(resty:RestyService<T>) {
    this.className = resty && resty.className;
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
  get$( uuids:string[]=[]): Observable<T[]> {
    this._id2seq = uuids.reduce( (res,id,i)=>{ res[id]=i; return res;}, {});
    this.reload(uuids, false)
    .then( items=>{
      if (['MarkerList'].includes(this.resty.className)){
        items.sort( (a,b)=>a['label']>b['label'] ? 1:-1 ).forEach( (o,i)=>{
          o['seq']=i;
        });
        // re-index sort
        this._id2seq = items.reduce( (res,o,i)=>{ res[o['uuid']]=i; return res;}, {});
      }
      this.next(items);
      // extras
      this.cacheOnlyPhotos(items);
    })
    return this._observable$;
  }
    
  reload(uuids?:any[], broadcast:boolean=true):Promise<T[]>{
    if (!uuids) {
      const items = this.subject$.value;
      if (items.length===0) return;   // do not reload if previously empty
      uuids = this.subject$.value.map( o=>o['uuid'] );  
    } 
    return this.resty.get(uuids)
    .then( items=>{
      items.forEach( (o,i)=>{
        o['seq'] = this._id2seq[ o['uuid'] ]; // sort by seq, as ordered in uuid:string[]
        if (o['seq']==null) o['seq'] = 1000+i;
      });
      this.modified = Date.now();  // for check against stale
      if (broadcast) this.next(items);
      return items
    });
  }

  next( items:T[] ){
    if (items.length != this.subject$.value.length) {
      this._id2seq = items.map(o=>o['uuid']).reduce( (res,id,i)=>{ res[id]=i; return res;}, {});
    }
    this.subject$.next(items);
  }

  value() {
    return this.subject$.value.slice();  // return a copy
  }
  
  repeat() {
    this.subject$.next(this.value());
  }

  watch$():Observable<T[]> {
    return this._observable$;
  }

  isStale(uuids:string[], ageInSeconds?:number):boolean{
    if (uuids.length != this.subject$.value.length) return true;
    const keys = this.subject$.value.map(o=>o['uuid']);
    const notEmpty = uuids.filter(id=>!keys.includes(id));
    if (notEmpty) return true;
    if (ageInSeconds && Date.now() - this.modified > (ageInSeconds*1000) ) return true;
    return false;
  }

  cacheOnlyPhotos(items:T[]){
    if (this.className != 'Photo') return;
    (items as any as IPhoto[]).forEach( o=>{
      AppCache.for('Photo').set(o);
    });
  }
}

export class UnionSubjectiveService<IMarker> extends SubjectiveService<IMarker> {
  private restys: RestyService<IMarker>[];

  constructor(restys:RestyService<IMarker>[]){
    super(null);
    this.restys = restys;
    this.subject$ = new BehaviorSubject<IMarker[]>([]);
    this._observable$ = this.subject$.pipe( SubjectiveService.sortBySeq );
  }

  get$( uuids:string[]): Observable<IMarker[]> {
    if (uuids.length==0) {
      this._id2seq = {}
      this.next([]);
    } else {
      this._id2seq = uuids.reduce( (res,id,i)=>{ res[id]=i; return res;}, {});
      this.reload(uuids, false)
      .then( merged=>{
        // extras
        // console.log(">>> UnionSubjSvc: merged=", merged);
        this.next(merged);
        this.cacheOnlyPhotos(merged);
      });
    }
    return this._observable$;
  }

  reload(uuids?:any[], broadcast:boolean=true):Promise<IMarker[]>{
    if (!uuids) {
      uuids = Object.keys(this._id2seq);
    }
    if (uuids.length==0) {
      if (broadcast) this.next([]);
      return Promise.resolve([]);   // do not reload if previously empty
    }
    const merged:IMarker[] = [];
    const waitFor = [];
    this.restys.forEach( async (resty)=>{
      const pr = resty.get(uuids).then( items=>{
        if (items.length>100) console.log("uuids=", uuids, items);
        items.forEach( o=>{
          o['seq'] = this._id2seq[o['uuid']]; // sort by seq, as ordered in uuid:string[]
          merged.push(o);
        });
      })
      waitFor.push(pr);
    });
    return Promise.all(waitFor)
    .then( (res)=>{
      if (broadcast) this.next(merged);
      return Promise.resolve(merged);
    });
  }
  cacheOnlyPhotos(items:IMarker[]){
    items.filter( o=>o['className']=="Photo")
    .forEach(o=>{
      AppCache.for('Photo').set(o);
    });
  }

}

