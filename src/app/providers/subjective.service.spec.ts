import { TestBed, inject } from '@angular/core/testing';

import { SubjectiveService } from './subjective.service';

describe('Subjective.Service', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SubjectiveService]
    });
  });

  it('should be created', inject([SubjectiveService], (service: SubjectiveService<any>) => {
    expect(service).toBeTruthy();
  }));
});
