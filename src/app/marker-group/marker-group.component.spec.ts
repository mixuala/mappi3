import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MarkerGroupComponent } from './marker-group.component';

describe('MarkerGroupComponent', () => {
  let component: MarkerGroupComponent;
  let fixture: ComponentFixture<MarkerGroupComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MarkerGroupComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MarkerGroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
