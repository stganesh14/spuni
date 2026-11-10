import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Loader } from '../services/loader';
import { loadingInterceptor } from './loading-interceptor';

describe('loadingInterceptor', () => {
  it('shows the progress bar while a request is in flight', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpClient);
    const loader = TestBed.inject(Loader);
    const controller = TestBed.inject(HttpTestingController);

    http.get('/api/v1/home').subscribe();
    expect(loader.isLoading()).toBe(true);
    controller.expectOne('/api/v1/home').flush({});
    expect(loader.isLoading()).toBe(false);
  });
});
