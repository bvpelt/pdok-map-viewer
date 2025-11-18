import { TestBed } from '@angular/core/testing';

import { LuchtfotoLayer } from './luchtfoto-layer';

describe('LuchtfotoLayer', () => {
  let service: LuchtfotoLayer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LuchtfotoLayer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
