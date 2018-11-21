import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { List, ModalController } from '@ionic/angular';
import { Observable, Subject, BehaviorSubject, } from 'rxjs';
import { takeUntil, map, switchMap, skipWhile } from 'rxjs/operators';

import {
  IMarker, IMarkerList, IMarkerGroup, IPhoto, IMapActions, IMappiMarker,
  IFavorite,
} from '../providers/types';
import  { MockDataService, RestyTrnHelper, quickUuid, } from '../providers/mock-data.service';
import { SubjectiveService } from '../providers/subjective.service';
import { HelpComponent } from '../providers/help/help.component';
import { AppCache } from '../providers/appcache';

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.page.html',
  styleUrls: ['./favorites.page.scss'],
})
export class FavoritesPage implements OnInit {

  public layout: string;  // values ['edit', 'gallery']
  public mapSettings: IMapActions = {
    dragend: false,
    click: true,
  }
  public mSubj: BehaviorSubject<IMarker[]>;
  public mCollection$ : Observable<IMarker[]>;
  public markerCollection$ : Observable<IMappiMarker[]>;
  public unsubscribe$ : Subject<boolean> = new Subject<boolean>();
  public stash:any = {
    map: null,
  };

  // private gallery:{items:PhotoSwipe.Item[], index:number, uuid:string, mgUuids?:string[]}
  @ViewChild('markerList') slidingList: List;


  static getOrCreateFavorite(marker:IMarker):IFavorite{
    const cached = AppCache.for('Favorite').get(marker.uuid);
    if (cached) return cached as IFavorite;

    const fields = ['uuid', 'className', 'favorite', 'created', 'modified'];
    const now = new Date();
    const o = {
      'uuid': marker.uuid,
      'className': marker['className'],
      'favorite': marker['_favorite'],
      'created': now,
      'modified': now,
    }
    return o as IFavorite;
  }

  async inflateFavorites(favorites: IFavorite[]):Promise<IMarker[]> {
    const fetch = favorites.reduce( (res,o)=>{
      res[o.className] = res[o.className] || [];
      res[o.className].push(o.uuid);
      return res;
    },{});

    const byUuid = {}
    const restyLookup = {
      MarkerGroup: 'MarkerGroups',
      MarkerList: 'MarkerLists',
    }

    // convert to Promise!!!
    const waitFor = [];
    Object.keys(fetch).forEach( async (className)=>{
      waitFor.push( this.dataService[restyLookup[className]].get( fetch[className] )
        .then( items=> items.forEach( o=>{
          byUuid[o.uuid]=o;
        }))
      );
    });
    await Promise.all(waitFor)
    // restore sort order of favorites
    const result:IMarker[] = favorites.map( o=>{ 
      const item = byUuid[o.uuid];
      item['_favorite'] = o.favorite;
      return item;
    });
    return Promise.resolve(result);
  }

  constructor(
    public dataService: MockDataService,
    private router: Router,
    private modalCtrl: ModalController,
  ) { }

  async ngOnInit() {
    this.layout = 'gallery';
    const favorites = AppCache.for('Favorite').items().filter(o=>!!o.favorite) as IFavorite[];
    const items = await this.inflateFavorites( favorites )
    this.mSubj = new BehaviorSubject<IMarker[]>(items);
    this.markerCollection$ = this.mCollection$ = this.mSubj.asObservable()
    .pipe(
      takeUntil(this.unsubscribe$),
      skipWhile( ()=>!this.stash.activeView),
    )
    this.mCollection$.subscribe( items=>items.forEach( item=>console.log(item) ) )
  }

  async viewWillEnter(){
    try {
      this.stash.activeView = true;
      // this._mgSub.reload(undefined, false);
      console.warn(`viewWillEnter: FavoritesPage`)

      const favorites = AppCache.for('Favorite').items() as IFavorite[];
      const items = await this.inflateFavorites( favorites )
      this.mSubj.next( items );
    } catch {}
  }

  viewWillLeave(){
    try {
      this.stash.activeView = false;
      console.warn(`viewWillLeave: FavoritesPage`);
    } catch {}
  }

  ngOnDestroy() {
    // console.warn("ngOnDestroy: unsubscribe to all subscriptions.")
    this.unsubscribe$.next(true);
    this.unsubscribe$.complete();
  }

}
