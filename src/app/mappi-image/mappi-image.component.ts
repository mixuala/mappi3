import { Component, Input, OnInit, OnChanges, SimpleChange,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { IPhoto } from '../providers/mock-data.service';
import { PhotoLibraryHelper, IThumbSrc } from '../providers/photo/photo.service';

@Component({
  selector: 'app-mappi-image',
  templateUrl: './mappi-image.component.html',
  styleUrls: ['./mappi-image.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MappiImageComponent implements OnChanges {
  
  data: IThumbSrc = {};

  // Promises: <app-mappi-image [photo]="photo"></app-mappi-image>
  @Input() photo: IPhoto;
  @Input() dim: string = '80x80';

  // Observers: <app-mappi-image [thumbSrc]="photo._thumbSrc$ | async"></app-mappi-image>
  @Input() thumbSrc: IThumbSrc;

  constructor(
    private cd: ChangeDetectorRef,
  ) { }

  ngOnChanges(o) {
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      const [k,change] = en;
      switch(k){
        case 'dim':
        case 'photo':
          if (this.photo){
            /**
             * NOTE: changeDetection doesn't seem to work as well as Observers
             */
            this.data.alt = this.photo.label;
            this.data = this.lazySrc(this.photo, this.dim);
          }
          break;
        case 'thumbSrc':
        if (this.thumbSrc){
          console.log( "@@@@ CHANGED!!!! <mappi-img>.thumbSrc$=", this.thumbSrc.src && this.thumbSrc.src.slice(0,25));
          this.data = this.thumbSrc;
        }
      }
    });    
  }

  /**
   * load IMG.src from IPhoto using Promise<src> 
   * calls cd.detectChanges() when resolved to update image
   * used for loading dataURLs from cameraroll/PhotoLibrary.getThumbnail(,{dataURL=true})
   * mutates photo.thumbSrc(!!)
   */
  lazySrc( photo:IPhoto, dim:string='80x80'):IThumbSrc {
    const result = PhotoLibraryHelper.lazySrc(photo, dim);
    const check = result === photo._thumbSrc
    if (result['loading'] && !result['chained'] ){
      // this is run 2x, once for each ngOnChanges
      result['loading'].then( src=>{
        this.data.src = src;
        this.data.title = photo.label;
        delete result['loading'];
        delete result['chained'];
        this.cd.detectChanges();
        console.log( "@@@@ CHANGED!!!! <mappi-img>.src=", this.data.src && this.data.src.slice(0,25));
      })
      result['chained'] = true;
    }
    if (result['chained'] ) console.warn( " ### skip this repeated call on lazySrc")
    return photo._thumbSrc;
  }

}
