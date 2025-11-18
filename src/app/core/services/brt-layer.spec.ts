import { TestBed } from '@angular/core/testing';

import { BrtLayer } from './brt-layer';

describe('BrtLayer', () => {
  let service: BrtLayer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BrtLayer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
