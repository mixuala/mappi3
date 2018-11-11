import { TestBed, inject } from '@angular/core/testing';

import { RestyService } from './resty.service';

describe('RestyService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RestyService]
    });
  });

  it('should be created', inject([RestyService], (service: RestyService<any>) => {
    expect(service).toBeTruthy();
  }));
});
