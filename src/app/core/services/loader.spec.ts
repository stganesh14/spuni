import { TestBed } from '@angular/core/testing';

import { Loader } from './loader';

describe('Loader', () => {
  let service: Loader;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Loader);
  });

  it('reference-counts concurrent work', () => {
    service.show();
    service.show();
    service.hide();
    expect(service.isLoading()).toBe(true);
    service.hide();
    expect(service.isLoading()).toBe(false);
  });

  it('never goes negative', () => {
    service.hide();
    service.show();
    expect(service.isLoading()).toBe(true);
  });
});
