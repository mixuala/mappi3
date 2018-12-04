import { Component, EventEmitter, OnInit, Input, Output } from '@angular/core';


import {
  IMarker, IRestMarker, IPhoto,
  IMoment, IChoosePhotoOptions, IMarkerLink,
} from '../providers/types';
import { MockDataService, RestyTrnHelper, Prompt, } from '../providers/mock-data.service';
import { PhotoService,  } from '../providers/photo/photo.service';
import { CamerarollPage } from '../cameraroll/cameraroll.page';
import { ModalController, } from '@ionic/angular';

@Component({
  selector: 'app-marker-add',
  templateUrl: './marker-add.component.html',
  styleUrls: ['./marker-add.component.scss']
})
export class MarkerAddComponent implements OnInit {


  public stash:any = {
    search:{
      searchIcon: '',
      placeholder: 'enter location or link',
      type: 'search',
      value: null,
    }
  };

  @Input() marker: IMarker;
  @Output() camerarollSelected: EventEmitter<IPhoto[]> = new EventEmitter<IPhoto[]>();
  @Output() markerChange: EventEmitter<{data:IMarker, action:string}> = new EventEmitter<{data:IMarker, action:string}>();

  constructor(
    public dataService: MockDataService,
    public photoService: PhotoService,
    private modalCtrl: ModalController,
  ) { }

  ngOnInit() {
  }

  async handle_addByCameraRoll(ev:MouseEvent){
    const options={
      onDismiss: async (resp:any={}):Promise<void> => {
        if (!resp.selected || !resp.selected.length) return;
        const result = await this.camerarollSelected.emit( resp.selected);
      }
    }
    const selected = await CamerarollPage.presentModal(this.modalCtrl, options);
  }


  // move to MarkerLinkComponent
  handle_SearchModeChanged(mode:string){
    switch (mode){
      case "map": 
        Object.assign(this.stash.search, {
          searchIcon: 'map',
          placeholder: 'enter a location',
          type: 'search',
        })
        break;
      case "link":
        Object.assign(this.stash.search, {
            searchIcon: 'link',
            placeholder: 'paste a link',
            type: 'url',
          }
        );
    }
  }

  searchBarInput(ev:any, self:any){
    if (ev && ev.detail && ev.detail.inputType=="insertFromPaste"){
      setTimeout( ()=>this.handle_addBySearchBar(this.stash.search.value), 100);
      console.log("keyboard PASTE detected value=", this.stash.search.value);
    }
  }

  async handle_addBySearchBar(ev:MouseEvent){
    // wrap in setTimeout() to handle_SearchModeChanged() first
    setTimeout( async ()=>{
      const search = this.stash.search;
      const value = search.value;
      const type = search.searchIcon;
      console.log("addBySearchBar(), value=", value, search);

      if (value && value.startsWith('http') || type=='link'){
        const markerLinks = await this.dataService.Links.get();
        const link = markerLinks.pop();
        console.log( "MarkerLink, value=", link);


        const marker = MarkerAddComponent.addMarkerLink(this.marker, link);
        // TODO: add as marker.markerLinkIds.push() or as MarkerGroup/Photo???

        await this.markerChange.emit({data:link, action:"markerLink"})
      }
      else {
        console.log( "search google placeIds for value=", value)
      }
      this.reset();
    });
  }

  reset(){
    this.stash.search.value = '';
  }

  static addMarkerLink(marker:IMarker, link:IMarkerLink):IMarker{
    marker.markerLinkIds = marker.markerLinkIds || [];
    marker.markerLinkIds.push(link.uuid);
    // add markerLink
    (link as IRestMarker)._rest_action = "post";
    marker['_commit_child_items'] = marker['_commit_child_items'] || [];
    marker['_commit_child_items'].push(link);
    return marker;
  }

}