import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { VintageFilm } from './vintage-film';

describe('VintageFilm', () => {
  let component: VintageFilm;
  let fixture: ComponentFixture<VintageFilm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VintageFilm],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(VintageFilm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
