import { TestBed, inject } from '@angular/core/testing';

import { MappiService } from './mappi.service';

describe('MappiService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MappiService]
    });
  });

  it('should be created', inject([MappiService], (service: MappiService) => {
    expect(service).toBeTruthy();
  }));
});
