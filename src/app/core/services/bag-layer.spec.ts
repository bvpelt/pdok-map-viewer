import { TestBed } from '@angular/core/testing';

import { BagLayer } from './bag-layer';

describe('BagLayer', () => {
  let service: BagLayer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BagLayer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
