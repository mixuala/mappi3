import { Component, OnDestroy, OnInit, AfterViewInit, ElementRef, Input, Renderer, ViewEncapsulation,
  ChangeDetectionStrategy, SimpleChange } from '@angular/core';

import * as PhotoSwipe from 'photoswipe';  
import { IPhoto } from '../providers/mock-data.service';
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
  protected active: boolean = false;

  @Input() data:{items:PhotoSwipe.Item[], index:number, uuid:string};
  
  constructor(
    private elementRef: ElementRef,
    private renderer: Renderer,
    // private viewCtrl: ViewController,
  ) { 
  }

  ngOnInit() {
  }

  ngAfterViewInit(){
    this.galleryElement = this.elementRef.nativeElement.firstElementChild;    
  }

  ngOnDestroy(){
    this.gallery.destroy();
  }

  reset():Promise<void> {
    if (!this.active)
      return Promise.resolve();
    return new Promise( (resolve)=>{
      setTimeout( ()=>{
        this.gallery.close();
      },500);
    })
  }

  launch(gallery:any) {
    gallery.listen('close', () => {
      this.active = false;
    });

    gallery.listen('destroy', () => {
        // This is required to remove component from DOM
        // TODO: what's the ionic v4 equivalent?
        // this.viewCtrl.dismiss();
        this.active = false;
        this.gallery = null;
    });

    gallery.init();
    this.gallery = gallery;
    this.active = true;
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
