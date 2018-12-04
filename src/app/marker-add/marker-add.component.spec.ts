import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MarkerAddComponent } from './marker-add.component';

describe('MarkerAddComponent', () => {
  let component: MarkerAddComponent;
  let fixture: ComponentFixture<MarkerAddComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MarkerAddComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MarkerAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
