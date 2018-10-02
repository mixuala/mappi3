import { Component, OnDestroy, OnInit, AfterViewInit, ElementRef, Input, ViewEncapsulation,
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
  
  constructor(
    private elementRef: ElementRef,
    // private viewCtrl: ViewController,
  ) { 
  }

  ngOnInit() {
  }

  ngAfterViewInit(){
    this.galleryElement = this.elementRef.nativeElement.firstElementChild;    
  }

  ngOnDestroy(){
    this.set_appFullscreen(false);
    this.gallery.destroy();
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
    gallery.listen('close', ()=>{
      this.set_appFullscreen(false);
    })

    gallery.listen('destroy', () => {
        // This is required to remove component from DOM
        // TODO: what's the ionic v4 equivalent?
        // this.viewCtrl.dismiss();
        if (this._fsClosure) {
          this.gallery.framework.unbind(this._fsClosure.el, this._fsClosure.type, this._fsClosure.handler);
          this._fsClosure.el.classList.toggle("pswp__button--fs", true);
          this._fsClosure = null;
        }
        this.gallery = null;
    });

    const googlemapsEl = document.getElementsByTagName('APP-GOOGLE-MAPS')[0];
    const homePageGridEl = googlemapsEl.nextElementSibling;
    gallery.viewportSize = this.getViewportSize();
    // console.log( JSON.stringify(gallery.viewportSize))

    gallery.init();
    this.setup_fullscreen_override(gallery);
    // gallery.ui.hideControls();
    this.gallery = gallery;
  }

  getViewportSize(fullscreen:boolean=false){
    let parentEl:Element;
    if (fullscreen) {
      parentEl = document.getElementsByTagName('ION-APP')[0];
      if (this.galleryElement.classList.contains('support-app-fs')){
        /**
         * this is a hack because mobile safari won't render photoswipe above the UI
         * it's probably better to find a fix to the CSS bug. position:fixed and z-index not working
         * 
         * this hack only works for portrait mode.
         */
        return {
          x: parentEl.clientWidth,
          y: parentEl.clientHeight -64,
        }
      }
    } else {
      const googlemapsEl = document.getElementsByTagName('APP-GOOGLE-MAPS')[0];
      parentEl = googlemapsEl.nextElementSibling;
    }
    return {
      x: parentEl.clientWidth,
      y: parentEl.clientHeight,
    };
  }

  /**
   * the following 3 methods modify PhotoSwipe.ui to support 2-stage fullscreen on platform=web 
   * NOTE: not yet working, need to override methods earlier in lifecycle
   * @param gallery:PhotoSwipe Class
   */
  setup_fullscreen_override(gallery:any){
    const platforms = document.getElementsByTagName('HTML')[0].classList
    if (platforms.contains('plt-ios') && platforms.contains('plt-tablet')==false) {
      // BUG: mobile safari has a z-index, position:fixed bug
      // skip the 2-stage fullscreen entirely
      if (gallery.ui.supportsFullscreen()==false){
        // need to enable the button, css show
        this.galleryElement.classList.add('support-app-fs');
      }
      else return;
    }
    // find fullscreen button
    const el = this._fsClosure && this._fsClosure.el || this.galleryElement.getElementsByClassName("pswp__button--fs")[0];
    const type = 'pswpTap click';
    const handler = (e:Event)=>{
      // disable original fullscreen click handler
      e.stopPropagation();
      e.preventDefault();
      if (gallery.ui.supportsFullscreen()==false){
        // doesn't support device fs, so just toggle app fs, don't unbind
        this.set_appFullscreen( !this.is_appFullscreen() );
        return;
      } 
      else this.set_appFullscreen(true);
      gallery.framework.unbind(this._fsClosure.el, this._fsClosure.type, this._fsClosure.handler);
      setTimeout( ()=>{
        // activate original fullscreen handler via fsButton.onTap() handler
        this._fsClosure.el.classList.toggle("pswp__button--fs", true);
      },10)
    }
    this._fsClosure = {el, type, handler};
    this._fsClosure.el.classList.toggle("pswp__button--fs", false);
    // add fullscreen within app, only
    gallery.framework.bind(el, type, handler);
  }
  is_appFullscreen(){
    return this.galleryElement.closest('ion-app').classList.contains('fullscreen-gallery');
  }
  set_appFullscreen(value:boolean){
    const parent = this.galleryElement.closest('ion-app');
    // const isFullscreen: boolean = this.is_appFullscreen();

    // console.info("toggle_fullscreen", value);
    if (value) {
      this.gallery.viewportSize = this.getViewportSize(value);
      parent.classList.toggle('fullscreen-gallery',true);
      this.gallery.updateSize(true);
      return Promise.resolve();
    } 
    parent.classList.toggle('fullscreen-gallery',false);
    setTimeout( ()=>{
      // add a delay before getting viewport size and hiding fullscreen
      // googlemapsEl need to regain original height
      this.gallery.viewportSize = this.getViewportSize(value);
      this.gallery.updateSize(true);
    },10)
    return;
  }

  // UNUSED
  override_ui_fullscreen(gallery:any){
    // NOTE: this isn't working because the ui uses a closure
    const fs = gallery.ui.getFullscreenAPI();
    const {enter, exit} = fs;
    fs.enter = ()=>{
      // if (this.is_appFullscreen()) return enter();
      return this.set_appFullscreen(true);
    };
    fs.exit = ()=>{
      console.warn("fs.exit(), fs=", fs.isFullscreen(), "appfs=", this.is_appFullscreen())
      // if (fs.isFullscreen()) return exit();
      return this.set_appFullscreen(false);
    }
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
          });
          break;
      }
    });
  }

}
