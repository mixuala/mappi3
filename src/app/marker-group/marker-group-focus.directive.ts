import { Directive, HostBinding, ElementRef } from '@angular/core';


/**
 * uses CSS .marker-group-focus.blur { display: none; } to hide targeted Element
 * usage:
 *  class MyClass {
      constructor(
        @Host() @Optional() private mgFocusNode: MarkerGroupFocusDirective
      ) { 
        this.mgFocusNode.blur(true)
      }
    }
 * 
 */
@Directive({
  selector: '.marker-group-focus'
})
export class MarkerGroupFocusDirective {
  @HostBinding('class.blur') private _blur:boolean = false;

  blur(value:boolean) {
    this._blur = value;
  }

}

