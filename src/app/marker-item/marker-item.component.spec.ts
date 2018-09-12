import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MarkerItemComponent } from './marker-item.component';

describe('MarkerItemComponent', () => {
  let component: MarkerItemComponent;
  let fixture: ComponentFixture<MarkerItemComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MarkerItemComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MarkerItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
