import { TestBed } from '@angular/core/testing';

import { LayerManager } from './layer-manager';

describe('LayerManager', () => {
  let service: LayerManager;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LayerManager);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
