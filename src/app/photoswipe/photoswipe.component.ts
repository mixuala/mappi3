import { Component, OnDestroy, OnInit, AfterViewInit, 
  ElementRef, EventEmitter, Input, Output, ViewEncapsulation,
  ChangeDetectionStrategy, SimpleChange,
} from '@angular/core';

import {
  IMarker, IRestMarker, IMarkerList, IMarkerGroup, IPhoto,
  IImgSrc,
} from '../providers/types';
import * as PhotoSwipe from 'photoswipe';  
import { ImgSrc,  } from '../providers/photo/imgsrc.service';
import { AppCache, } from '../providers/appcache';
import { MockDataService, } from '../providers/mock-data.service';
import { AppConfig, ScreenDim } from '../providers/helpers';

declare const PhotoSwipeUI_Default: any;



@Component({
  selector: 'app-photoswipe',
  templateUrl: './photoswipe.component.html',
  styleUrls: [
    './photoswipe.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class PhotoswipeComponent implements OnDestroy, OnInit, AfterViewInit {

  protected galleryElement: HTMLElement;
  protected gallery: PhotoSwipe<PhotoSwipe.Options>;
  public defaultOptions:PhotoSwipe.Options = {
    index: 0,
    history: false,
  };
  // for managing 2-stage fullscreen
  private _fsClosure:{el:Element, type:string, handler:(e:Event)=>void};

  @Input() data:{items:PhotoSwipe.Item[], index:number, uuid:string};
  @Input() screenDim:string;
  @Output() indexChange: EventEmitter<{index:number, items:any[], uuid:string}> = new EventEmitter<{index:number, items:any[], uuid:string}>();

  constructor(
    private elementRef: ElementRef,
    // private viewCtrl: ViewController,
  ) { }

  /**
   * 
   * @param markerGroups 
   * @param initial 
   * @param galleryId 
   */
  static async prepareGallery( markerGroups:IMarker[], initial:IPhoto, galleryId:string){
    let items:PhotoSwipe.Item[] = [];
    const mgUuids:string[] = []; // index lookup to MarkerGroup.uuid
    const screenDim = await ScreenDim.dim;
    // get all photos for all markerGroups in this markerList
    const waitFor:Promise<void>[] = [];
    let sortOrder:string[] = [];
    markerGroups.forEach( mg=>{
      const mgPhotos = MockDataService.getSubjByParentUuid(mg.uuid).value();
      sortOrder = sortOrder.concat(mgPhotos.sort( (a,b)=>a['seq']-b['seq']).map(o=>o.uuid));
      mgPhotos.forEach( i=>mgUuids.push( mg.uuid) );
      mgPhotos.forEach( (p:IPhoto)=>{
        waitFor.push(

          new Promise( async (resolve, reject)=>{
            const fsDim = await ImgSrc.scaleDimToScreen(p, screenDim);
            const [imgW, imgH] = fsDim.split('x');
            const done = ImgSrc.getImgSrc$(p, fsDim)
            .subscribe( (fsSrc:IImgSrc)=>{
              if (!fsSrc.src) return;
              // NOTE: these responses are return async, and not in sort order!!!
              const item = {
                src: fsSrc.src,
                w: parseInt(imgW),
                h: parseInt(imgH),
              }; 
              item['uuid'] = p.uuid;
              items.push(item);
              done && done.unsubscribe();
              resolve();
            });
          }) // end new Promise()

        );
      });

    });
    await Promise.all(waitFor);
    const index = sortOrder.findIndex( key=>key == initial.uuid);
    const sortedItems:PhotoSwipe.Item[] = sortOrder.map( key=>items.find(o=>o['uuid']==key) );
    const uuid = galleryId;
    return {items:sortedItems, index, uuid, mgUuids};    
  }

  ngOnInit() {
  }

  ngAfterViewInit(){
    this.galleryElement = this.elementRef.nativeElement.firstElementChild;
    // this.dom
    // document.getElementsByTagName('ION-APP')[0];
    // contentEl = document.getElementsByClassName('marker-group-wrap')[0];
    this.moveToContainer('fixed')
  }

  ngOnDestroy(){
    if (this.gallery) {
      this.toggle_appFullscreen(false);
      this.gallery.destroy();
    }
  }

  /**
   * move galleryElement, .pswp, to position:fixed container for proper z-index positioning
   * - move AFTER sizing but BEFORE display
   * 
   * @param target ['content', 'fixed']
   */
  moveToContainer(target:string) {
    let container:HTMLElement;
    switch (target) {
      case 'content':
        container = this.elementRef.nativeElement;
      case 'fixed':
        container = document.getElementById('photoswipe-host');
    }
    container.appendChild(this.galleryElement);
  }

  async rescaleToScreen(screenDim:string){
    // guard for not active
    if (!this.data || !this.gallery) return;
    
    this.gallery.invalidateCurrItems();

    const waitFor:Promise<string>[] = [];
    this.gallery.items.forEach( (o,i)=>{
      const p:IPhoto = AppCache.for('Photo').get(o['uuid'] );
      const pr = ImgSrc.scaleDimToScreen(p, screenDim)
      .then( (fsDim)=>{
        const [imgW, imgH] = fsDim.split('x');
        return new Promise<string>( (resolve,reject)=>{

          const done = ImgSrc.getImgSrc$(p, fsDim).subscribe( (imgSrc)=>{
            if (!imgSrc.src) return // skipWhile 
            Promise.resolve()
            .then( ()=>{
              return imgSrc['loading'] || null
            })
            .then( ()=>{
              o.src = imgSrc.src;
              o.w = parseInt(imgW);
              o.h = parseInt(imgH);
              done.unsubscribe();
              resolve(o.src);
            });
          });

        })
        .catch((err)=>{
          console.warn("ERROR: PhotoSwipe.rescaleToScreen, msg=", err);
          return Promise.resolve("ERROR: PhotoSwipe.rescaleToScreen()")
        });  // new Promise<string>()
        
      });
      waitFor.push(pr);
    });
    const result = await Promise.all(waitFor)
    setTimeout( ()=>{
      this.gallery.updateSize(true);
      console.log("rescaleToScreen", screenDim, result.map( s=>s.slice(0,50)) )
    },10);
  }

  reset():Promise<void> {
    if (this.gallery){
      return new Promise( (resolve)=>{
        setTimeout( ()=>{
          // this.gallery.framework.unbind(this.fullscreenButtonElement, 'pswpTap click', _set_AppFullscreen);
          this.gallery.close();
          // this.toggle_appFullscreen(false);
          return resolve();
        },10);
      })
    }
    return Promise.resolve();
  }

  launch(gallery:any) {
    const self = this;
    gallery.listen('close', ()=>{
      self.toggle_appFullscreen(false);
      self.toggle_appFullscreen(false, 'gallery');
      this.indexChange.emit({
        items:[], 
        index:null,
        uuid:this.data.uuid,
      })
    });

    gallery.listen('destroy', () => {
        // This is required to remove component from DOM
        // TODO: what's the ionic v4 equivalent?
        // self.viewCtrl.dismiss();
        console.warn("PhotoswipeComponent.gallery destroy event")
        if (self._fsClosure) {
          self.gallery.framework.unbind(self._fsClosure.el, self._fsClosure.type, self._fsClosure.handler);
          self._fsClosure.el.classList.toggle("pswp__button--fs", true);
          self._fsClosure = null;
        }
        self.gallery = null;
    });
    // gallery.listen('afterInit', ()=>{
    //   // check also: initialLayout

    //   const el = document.getElementsByClassName('pswp--open')[0];
    //   const [w,h] = AppConfig.screenWH;
    //   let pct:number;
    //   if (h > w) pct = el['offsetTop']/h * 100;
    //   else pct = el['offsetLeft']/w * 100;
    //   console.warn( `@@@ photoswipe 'afterInit', layout top/left=${Math.round(pct)}%`);

    //   // setTimeout( ()=>this.moveToContainer('fixed'), 2000)
    // });
    // gallery.listen('initialLayout', ()=>{
    //   // init() > updateSize() > 'initialLayout' > 'afterInit' > 'resize'
    //   // check also: initialLayout
    //   console.warn( `@@@ photoswipe, 'initialLayout' `);
    // });
    // gallery.listen('resize', ()=>{
    //   // init() > updateSize() > 'resize' > 'afterInit' > 'resize'
    //   // check also: initialLayout
    //   console.warn( `@@@ photoswipe, 'resize' `);
    // });

    gallery.init();
    self.setup_fullscreen_override(gallery);
    // gallery.ui.hideControls();
    // add className to parent for css styling of ancestors
    self.toggle_appFullscreen(true, 'gallery');
    self.gallery = gallery;
  }

  /**
   * the following 3 methods modify PhotoSwipe.ui to support 2-stage fullscreen on platform=web 
   * NOTE: not yet working, need to override methods earlier in lifecycle
   * @param gallery:PhotoSwipe Class
   */
  setup_fullscreen_override(gallery:any){
    const platforms = document.getElementsByTagName('HTML')[0].classList
    if (platforms.contains('plt-ios') 
      // && platforms.contains('plt-tablet')==false
    ) {
      // skip the 2-stage fullscreen entirely
      if (gallery.ui.supportsFullscreen()==false){
        // need to enable the button, css show
        this.galleryElement.classList.add('support-app-fs');
        console.warn("*** limited to app fs only");
      }
    }
    // find fullscreen button
    const el = this._fsClosure && this._fsClosure.el || this.galleryElement.getElementsByClassName("pswp__button--fs")[0];
    const type = 'pswpTap click';
    const self = this;
    const handler = (e:Event)=>{
      // disable original fullscreen click handler
      e.stopPropagation();
      e.preventDefault();

      if (gallery.ui.supportsFullscreen()==false 
        || self.galleryElement.classList.contains('support-app-fs'))
      {
        // does not support device fs
        // just toggle app fs, don't unbind listener yet.
        self.toggle_appFullscreen();
        return;
      } 
      else {
        // goto app fs,
        self.toggle_appFullscreen(true);
        // unbind this listener now
        gallery.framework.unbind(self._fsClosure.el, self._fsClosure.type, self._fsClosure.handler);
        // activate device fs handler by adding class to button.
        // console.warn("*** next click will goto device fs")
        setTimeout( ()=>{
          // activate original fullscreen handler via fsButton.onTap() handler
          self._fsClosure.el.classList.toggle("pswp__button--fs", true);
        },10)
      }
    }
    this._fsClosure = {el, type, handler};
    this._fsClosure.el.classList.toggle("pswp__button--fs", false);
    // add fullscreen within app, only
    gallery.framework.bind(el, type, handler);
  }
  toggle_appFullscreen(value?:boolean, className:string='fullscreen-gallery'){
    const parent = this.galleryElement.closest('ION-APP');
    if (!parent) {
      console.warn("Cannot find ION-APP, has the view already been destroyed?")
      return;
    }
    if (typeof value == 'undefined') 
      value = !parent.classList.contains(className);
    if (value) {
      parent.classList.toggle(className,true);
    } 
    else
      parent.classList.toggle(className,false);

    setTimeout( ()=>{
      // add a delay before getting viewport size and hiding fullscreen
      // googlemapsEl need to regain original height
      if (!this.gallery) return;
      this.gallery.updateSize(true);
    },10)
    return;
  }

  ngOnChanges(o){
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;    
      switch(k){
        case 'screenDim':
          this.rescaleToScreen(this.screenDim); 
          break;
        case 'data':
          if (change.firstChange) return;
          this.reset()
          .then( ()=>{
            const {items, index, uuid} = change.currentValue;
            const galleryOptions = Object.assign({}, this.defaultOptions, {
              index : index || 0,
              galleryUID: uuid,
            });          
            const gallery = new PhotoSwipe( this.galleryElement, PhotoSwipeUI_Default
              , items
              , galleryOptions
              );
            this.launch(gallery);
            gallery.listen('afterChange', ()=>{
              this.indexChange.emit({
                items:gallery.items, 
                index:gallery.getCurrentIndex(), 
                uuid:uuid
              });
            });
          });
          break;
      }
    });
  }

}
