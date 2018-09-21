import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RestyService<T> {

  public debug:boolean = false;
  protected classname: string = "RESTY";
  protected _data:{[uuid:string]: T};

  constructor(jsonArray:Array<T>=[], classname?:string) {
    this._data = jsonArray.reduce( (res, o:T)=>{
      const uuid = o['uuid'] || quickUuid();
      res[uuid] = Object.assign({uuid}, o, {uuid});
      return res;
    },{});
    this.classname = classname || this.classname;
   }

  get(uuid?:string | string[]):Promise<T[]>{
    return Promise.resolve()
    .then( res=>{ 
      if (!uuid || uuid == 'all'){
        return Promise.resolve(Object.values(this._data))
      }
      if (Array.isArray(uuid)){
        const result:T[] = Object.values(this._data).reduce( (res, o:T)=>{
          if ( uuid.includes( o['uuid'] ) ){
            res.push( o );
          }
          return res;
        }, []);
        return Promise.resolve(result); 
      }
      return Promise.resolve([ this._data[uuid] ]);
    })
    .then( res=>{
      // make sure we return a COPY of the data
      return res.map( o=>Object.assign({},o) );
    })
  }

  getById$(uuid:string):Observable<T>{
    return from(
      this.get([uuid]).then( a=>{
        this.debug && console.log( `${this.classname}: getById$`, a[0]);
        return a[0] })
    );
  }

  query( filter:(o:any)=>boolean ):Promise<T[]>{ 
    if (!filter)
      return this.get('all');
    try{
      const res = Object.values(this._data).filter( o=>filter(o) );
      return Promise.resolve(res); 
    } catch (e) {
      return Promise.reject(e);
    }
  }

  post(o:T):Promise<T>{
    if (!o)
      return Promise.reject(false);
    const uuid = o['uuid'] || quickUuid();
    if (Object.keys(this._data).includes(uuid)) 
      return Promise.reject("ERROR: duplicate uuid");
      o['uuid'] = uuid;
    this._data[uuid] = o;
    this.debug && console.log( `${this.classname}: POST`, o);

    return Promise.resolve( o );
  }
  post$(o:T):Observable<T>{
    return from( this.post(o) );
  }

  put(uuid:string, o:T):Promise<T>{
    if (!uuid) 
      return Promise.reject(false);
    if (this._data[uuid]) {
      o['uuid'] = uuid;
      this._data[uuid] = o;
      this.debug && console.log( `${this.classname}: PUT`, o);


      // ???: how do I cause send .next(o) to getById$(uuid) subscriber


      return Promise.resolve( o );
    }
    return Promise.reject("ERROR: object not found");
  }

  delete(uuid:string):Promise<boolean>{
    if (!uuid || !this._data[uuid]) 
      return Promise.reject(false);
    this.debug && console.log( `${this.classname}: DELETE`, this._data[uuid]);  
    delete this._data[uuid];
    return Promise.resolve(true);

  }

}







// from: https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
//       https://codepen.io/avesus/pen/wgQmaV?editors=0012
export function quickUuid():string {
  return quickUuid.prototype.formatUuid(quickUuid.prototype.getRandomValuesFunc());
}
quickUuid.prototype.lut = Array(256).fill(null).map((_, i) => (i < 16 ? '0' : '') + (i).toString(16));
quickUuid.prototype.formatUuid = ({d0, d1, d2, d3}) => {
  const lut = quickUuid.prototype.lut;
  return lut[d0       & 0xff]        + lut[d0 >>  8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
  lut[d1       & 0xff]        + lut[d1 >>  8 & 0xff] + '-' +
  lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
  lut[d2       & 0x3f | 0x80] + lut[d2 >>  8 & 0xff] + '-' +
  lut[d2 >> 16 & 0xff]        + lut[d2 >> 24 & 0xff] +
  lut[d3       & 0xff]        + lut[d3 >>  8 & 0xff] +
  lut[d3 >> 16 & 0xff]        + lut[d3 >> 24 & 0xff];
}
quickUuid.prototype.getRandomValuesFunc = window.crypto && window.crypto.getRandomValues ?
  () => {
    const dvals = new Uint32Array(4);
    window.crypto.getRandomValues(dvals);
    return {
      d0: dvals[0],
      d1: dvals[1],
      d2: dvals[2],
      d3: dvals[3],
    };
  } :
  () => ({
    d0: Math.random() * 0x100000000 >>> 0,
    d1: Math.random() * 0x100000000 >>> 0,
    d2: Math.random() * 0x100000000 >>> 0,
    d3: Math.random() * 0x100000000 >>> 0,
  });