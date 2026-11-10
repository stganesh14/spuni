import { ChangeDetectionStrategy, Component, effect, inject, input, output, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Address, AddressInput } from '../../../core/api/models';
import { INDIAN_STATES } from '../../../core/utils/labels';

const NAME = /^[A-Za-zÀ-ɏऀ-෿][A-Za-zÀ-ɏऀ-෿ .'-]{1,119}$/;
const PHONE = /^(\+?\d{10,15}|\d{10})$/;
const PIN = /^[1-9][0-9]{5}$/;

/** Indian shipping address form with the same rules the API enforces. */
@Component({
  selector: 'app-address-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="form-grid">
      <div class="field">
        <label for="af-name">Full name</label>
        <input id="af-name" class="input" formControlName="full_name" autocomplete="name" maxlength="120" />
        @if (bad('full_name')) { <small class="err">Enter the recipient's name (letters only).</small> }
      </div>
      <div class="field">
        <label for="af-phone">Mobile number</label>
        <input id="af-phone" class="input" formControlName="phone" autocomplete="tel" inputmode="tel" maxlength="16"
               placeholder="10-digit mobile" />
        @if (bad('phone')) { <small class="err">Enter a valid 10-digit mobile number.</small> }
      </div>
      <div class="field span-2">
        <label for="af-l1">House, building, street</label>
        <input id="af-l1" class="input" formControlName="line1" autocomplete="address-line1" maxlength="200" />
        @if (bad('line1')) { <small class="err">Please add your street address.</small> }
      </div>
      <div class="field">
        <label for="af-l2">Area, colony <span class="opt">(optional)</span></label>
        <input id="af-l2" class="input" formControlName="line2" autocomplete="address-line2" maxlength="200" />
      </div>
      <div class="field">
        <label for="af-lm">Landmark <span class="opt">(optional)</span></label>
        <input id="af-lm" class="input" formControlName="landmark" maxlength="120" />
      </div>
      <div class="field">
        <label for="af-city">City</label>
        <input id="af-city" class="input" formControlName="city" autocomplete="address-level2" maxlength="80" />
        @if (bad('city')) { <small class="err">Enter your city.</small> }
      </div>
      <div class="field">
        <label for="af-pin">PIN code</label>
        <input id="af-pin" class="input" formControlName="postal_code" autocomplete="postal-code" inputmode="numeric"
               maxlength="6" />
        @if (bad('postal_code')) { <small class="err">Enter a valid 6-digit PIN code.</small> }
      </div>
      <div class="field">
        <label for="af-state">State</label>
        <select id="af-state" class="select" formControlName="state" autocomplete="address-level1">
          <option value="" disabled>Select state</option>
          @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        @if (bad('state')) { <small class="err">Choose your state.</small> }
      </div>
      <div class="field">
        <label for="af-label">Save as <span class="opt">(optional)</span></label>
        <input id="af-label" class="input" formControlName="label" maxlength="40" placeholder="Home, Office…" />
      </div>
      @if (showDefault()) {
        <label class="check span-2"><input type="checkbox" formControlName="is_default" /> <span>Make this my default address</span></label>
      }
      @if (showSubmit()) {
        <div class="actions span-2">
          <button class="btn btn-primary" type="submit" [disabled]="busy()">
            @if (busy()) { <span class="spin"></span> } {{ submitLabel() }}
          </button>
          <button class="btn btn-ghost" type="button" (click)="cancelled.emit()">Cancel</button>
        </div>
      }
    </form>
  `,
  styles: `
    .err { color: var(--danger); font-size: .76rem; }
    .opt { color: var(--muted); font-weight: 400; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressForm {
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly initial = input<Address | null>(null);
  readonly busy = input(false);
  readonly showSubmit = input(true);
  readonly showDefault = input(true);
  readonly submitLabel = input('Save address');
  readonly saved = output<AddressInput>();
  readonly cancelled = output<void>();

  protected readonly states = INDIAN_STATES;
  readonly form = this.fb.group({
    full_name: ['', [Validators.required, Validators.pattern(NAME)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE)]],
    line1: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    line2: [''],
    landmark: [''],
    city: ['', [Validators.required, Validators.minLength(2)]],
    state: ['', Validators.required],
    postal_code: ['', [Validators.required, Validators.pattern(PIN)]],
    label: [''],
    is_default: [false],
  });

  constructor() {
    effect(() => {
      const a = this.initial();
      untracked(() => {
        if (!a) return;
        this.form.reset({
          full_name: a.full_name, phone: a.phone.replace(/^\+91/, ''), line1: a.line1, line2: a.line2 ?? '',
          landmark: a.landmark ?? '', city: a.city, state: a.state, postal_code: a.postal_code, label: a.label ?? '',
          is_default: a.is_default,
        });
      });
    });
  }

  protected bad(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  /** Returns the cleaned value, or null (and shows errors) when invalid. */
  value(): AddressInput | null {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return null;
    }
    const v = this.form.getRawValue();
    const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
    return {
      full_name: clean(v.full_name),
      phone: v.phone.replace(/[\s()-]/g, ''),
      line1: clean(v.line1),
      line2: clean(v.line2) || null,
      landmark: clean(v.landmark) || null,
      city: clean(v.city),
      state: v.state,
      postal_code: v.postal_code.trim(),
      label: clean(v.label) || null,
      is_default: v.is_default,
    };
  }

  submit(): void {
    const value = this.value();
    if (value) this.saved.emit(value);
  }
}
