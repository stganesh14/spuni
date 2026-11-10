import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PremiumLoader } from './premium-loader';

describe('PremiumLoader', () => {
  let component: PremiumLoader;
  let fixture: ComponentFixture<PremiumLoader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PremiumLoader],
    }).compileComponents();

    fixture = TestBed.createComponent(PremiumLoader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
