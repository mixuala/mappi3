import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MappiImageComponent } from './mappi-image.component';

describe('MappiImageComponent', () => {
  let component: MappiImageComponent;
  let fixture: ComponentFixture<MappiImageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MappiImageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MappiImageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
