import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { Api, apiErrorMessage } from '../../core/api/api.service';
import { Address, AddressInput } from '../../core/api/models';
import { ToastService } from '../../core/ui/toast.service';
import { AddressForm } from '../../shared/components/address-form/address-form';

@Component({
  selector: 'app-account-addresses',
  imports: [AddressForm],
  template: `
    <section class="panel">
      <div class="row">
        <h2>Addresses</h2>
        @if (editing() === null) {
          <button type="button" class="btn btn-sm" (click)="editing.set('new')"><i class="bi bi-plus"></i> Add address</button>
        }
      </div>

      @if (editing() === 'new') {
        <div class="form"><app-address-form [busy]="busy()" (saved)="save($event)" (cancelled)="editing.set(null)" /></div>
      }

      <div class="list">
        @for (a of addresses(); track a.id) {
          @if (editing() === a.id) {
            <div class="form"><app-address-form [initial]="a" [busy]="busy()" (saved)="save($event, a.id)"
                                                (cancelled)="editing.set(null)" /></div>
          } @else {
            <article class="addr" [class.default]="a.is_default">
              <div>
                <b>{{ a.full_name }}</b> @if (a.label) { <span class="chip mini">{{ a.label }}</span> }
                @if (a.is_default) { <span class="badge">Default</span> }
                <p>{{ a.line1 }}@if (a.line2) {, {{ a.line2 }}}@if (a.landmark) {, {{ a.landmark }}}<br />
                  {{ a.city }}, {{ a.state }} {{ a.postal_code }}<br />{{ a.phone }}</p>
              </div>
              <div class="actions">
                <button type="button" class="btn btn-ghost btn-sm" (click)="editing.set(a.id)">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="remove(a)" [disabled]="busy()">Delete</button>
              </div>
            </article>
          }
        } @empty {
          @if (loaded() && editing() !== 'new') { <p class="muted">No saved addresses yet. Add one to check out faster.</p> }
        }
      </div>
    </section>
  `,
  styles: `
    .panel { background: var(--paper); }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    h2 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 1.5rem; }
    .form { padding: 16px; border: 1px dashed var(--line-strong); border-radius: 16px; margin-bottom: 16px; }
    .list { display: grid; gap: 12px; }
    @media (min-width: 768px) { .list { grid-template-columns: 1fr 1fr; } .list .form { grid-column: 1 / -1; } }
    .addr { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--line); border-radius: 16px; }
    .addr.default { border-color: var(--burgundy); }
    .addr p { margin: 8px 0 0; color: var(--brown-soft); font-size: .9rem; }
    .mini { min-height: 0; padding: 1px 8px; font-size: .62rem; }
    .actions { display: flex; gap: 6px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAddresses {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  protected readonly addresses = signal<Address[]>([]);
  protected readonly editing = signal<number | 'new' | null>(null);
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);

  constructor() {
    this.load();
  }

  save(body: AddressInput, id?: number): void {
    this.busy.set(true);
    const call = id ? this.api.updateAddress(id, body) : this.api.createAddress(body);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.editing.set(null);
        this.toast.success(id ? 'Address updated.' : 'Address saved.');
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }

  remove(a: Address): void {
    if (typeof confirm === 'function' && !confirm(`Delete the address for ${a.full_name}?`)) return;
    this.busy.set(true);
    this.api.deleteAddress(a.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show('Address deleted.');
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.api.addresses().subscribe({
      next: (list) => {
        this.addresses.set(list);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
