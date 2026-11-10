import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { EthicalLeather } from './ethical-leather';

describe('EthicalLeather', () => {
  let component: EthicalLeather;
  let fixture: ComponentFixture<EthicalLeather>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EthicalLeather],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(EthicalLeather);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
