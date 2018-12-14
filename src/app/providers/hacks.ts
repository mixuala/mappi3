import { RestyTrnHelper, } from '../providers/mock-data.service';
import { MappiMarker, } from '../providers/mappi/mappi.service';
import { AppConfig } from '../providers/helpers';


import {
  IMarker, IPhoto, IMarkerLink,
} from './types'


export class Hacks {
  // HACK: decide how to include MarkerLinks 
  static patch_MarkerLink_as_MarkerGroup(link:IMarkerLink){
    const mg = RestyTrnHelper.getPlaceholder('MarkerGroup', link);
    mg.label = link.title;
    const position = AppConfig.map.getCenter().toJSON();
    mg.loc = [position.lat, position.lng];
    mg.position = MappiMarker.position(mg);
    if (link.image){ 
      // add MarkerLink self ref, to show thumbnail as markerItem image
      mg.markerItemIds = [mg.uuid]  
      mg.src = link.image;   // emulate IPhoto
    }
    // get width, height
    return mg;
  }

  // HACK: decide how to include MarkerLinks 
  static patch_MarkerLink_as_MarkerItem(link:IMarkerLink){
    const p = RestyTrnHelper.getPlaceholder('Photo', link);
    delete p.camerarollId;   // do NOT mangle url for picsum
    p.label = link.title;
    p.dateTaken = new Date(link.published);
    const position = AppConfig.map.getCenter().toJSON();
    p.loc = [position.lat, position.lng];
    p.position = MappiMarker.position(p);
    // add MarkerLink self ref, patch for photoswipe
    p.src = link.image;   // emulate IPhoto
    return p;
  }

}