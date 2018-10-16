import { Component, OnDestroy, OnInit, AfterViewInit, 
  ElementRef, EventEmitter, Input, Output, ViewEncapsulation,
  ChangeDetectionStrategy, SimpleChange } from '@angular/core';

import * as PhotoSwipe from 'photoswipe';  
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
  protected gallery: any;
  public defaultOptions:PhotoSwipe.Options = {
    index: 0,
    history: false,
  };
  private _fsClosure:{el:Element, type:string, handler:(e:Event)=>void};

  @Input() data:{items:PhotoSwipe.Item[], index:number, uuid:string};
  @Output() indexChange: EventEmitter<{index:number, items:any[], uuid:string}> = new EventEmitter<{index:number, items:any[], uuid:string}>();
  constructor(
    private elementRef: ElementRef,
    // private viewCtrl: ViewController,
  ) { 
  }

  ngOnInit() {
  }

  ngAfterViewInit(){
    this.galleryElement = this.elementRef.nativeElement.firstElementChild;
    // this.dom
    // document.getElementsByTagName('ION-APP')[0];
    // contentEl = document.getElementsByClassName('marker-group-wrap')[0];
  }

  ngOnDestroy(){
    if (this.gallery) {
      this.toggle_appFullscreen(false);
      this.gallery.destroy();
    }
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
    })

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

    gallery.init();
    self.setup_fullscreen_override(gallery);
    // gallery.ui.hideControls();
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
  toggle_appFullscreen(value?:boolean){
    const parent = this.galleryElement.closest('ION-APP');
    if (!parent) {
      console.warn("Cannot find ION=APP, has the view already been destroyed?")
      return;
    }
    if (typeof value == 'undefined') 
      value = !parent.classList.contains('fullscreen-gallery');
    // console.info("toggle_fullscreen", value);
    if (value) {
      parent.classList.toggle('fullscreen-gallery',true);
      // this.gallery.updateSize(true);
      // console.warn("*** > set to app fs")
    } 
    else
      parent.classList.toggle('fullscreen-gallery',false);

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
