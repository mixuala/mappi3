
import { Injectable } from '@angular/core';
import { CanActivate, CanDeactivate } from '@angular/router';
import { HomePage } from './home.page';

@Injectable()
export class ConfirmChangesRouteGuard implements CanDeactivate<HomePage> {
  canDeactivate(component: HomePage): Promise<boolean> {
    if (component.hasChanges()) {
      const resp = confirm('Discard changes?');
      if (resp) {
        return component.applyChanges("rollback").then( ()=>true);
      }
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }
}