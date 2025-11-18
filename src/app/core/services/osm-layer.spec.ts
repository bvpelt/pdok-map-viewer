import { TestBed } from '@angular/core/testing';

import { OsmLayer } from './osm-layer';

describe('OsmLayer', () => {
  let service: OsmLayer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OsmLayer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
