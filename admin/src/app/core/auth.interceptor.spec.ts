import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';

const user = { id: 1, email: 'admin@spuni.in', full_name: null, phone: null, role: 'admin', marketing_opt_in: false, created_at: '' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  it('refreshes once on 401 and retries concurrent requests with the new token', async () => {
    const a = firstValueFrom(http.get('/api/v1/admin/products'));
    const b = firstValueFrom(http.get('/api/v1/admin/orders'));
    ctrl.expectOne('/api/v1/admin/products').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/admin/orders').flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = ctrl.expectOne('/api/v1/admin/auth/refresh');
    expect(refresh.request.headers.get('X-Requested-With')).toBe('spuni');
    expect(refresh.request.withCredentials).toBe(true);
    refresh.flush({ access_token: 'new-token', token_type: 'bearer', expires_in: 900, user, is_new_user: false });

    const retryA = ctrl.expectOne('/api/v1/admin/products');
    const retryB = ctrl.expectOne('/api/v1/admin/orders');
    expect(retryA.request.headers.get('Authorization')).toBe('Bearer new-token');
    expect(retryB.request.headers.get('Authorization')).toBe('Bearer new-token');
    retryA.flush({ ok: 1 });
    retryB.flush({ ok: 2 });
    expect(await a).toEqual({ ok: 1 });
    expect(await b).toEqual({ ok: 2 });
    ctrl.verify();
  });
});
