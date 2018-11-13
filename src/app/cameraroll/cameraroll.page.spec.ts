import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CamerarollPage } from './cameraroll.page';

describe('CamerarollPage', () => {
  let component: CamerarollPage;
  let fixture: ComponentFixture<CamerarollPage>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CamerarollPage ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CamerarollPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
