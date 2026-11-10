import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, apiErrorMessage, apiFieldErrors } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-account-profile',
  imports: [FormsModule],
  template: `
    <section class="panel">
      <h2>Profile</h2>
      <form (ngSubmit)="save()" class="form-grid" novalidate>
        <div class="field">
          <label for="p-name">Full name</label>
          <input id="p-name" class="input" name="name" [(ngModel)]="name" maxlength="120" autocomplete="name" />
          @if (errors()['full_name']) { <small class="err">{{ errors()['full_name'] }}</small> }
        </div>
        <div class="field">
          <label for="p-phone">Mobile number</label>
          <input id="p-phone" class="input" name="phone" [(ngModel)]="phone" maxlength="16" inputmode="tel" autocomplete="tel" />
          @if (errors()['phone']) { <small class="err">{{ errors()['phone'] }}</small> }
        </div>
        <div class="field span-2">
          <label for="p-email">Email</label>
          <input id="p-email" class="input" [value]="auth.user()?.email ?? ''" disabled />
          <small class="muted">Your email is how you sign in. Contact us to change it.</small>
        </div>
        <label class="check span-2"><input type="checkbox" name="mk" [(ngModel)]="marketing" />
          <span>Email me about new drops and members-only offers</span></label>
        <div class="span-2"><button class="btn btn-primary" type="submit" [disabled]="busy()">
          @if (busy()) { <span class="spin"></span> } Save changes</button></div>
      </form>
    </section>
  `,
  styles: `
    .panel { background: var(--paper); }
    h2 { margin: 0 0 16px; font-family: var(--font-display); font-weight: 400; font-size: 1.5rem; }
    .err { color: var(--danger); font-size: .76rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfile {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected name = this.auth.user()?.full_name ?? '';
  protected phone = (this.auth.user()?.phone ?? '').replace(/^\+91/, '');
  protected marketing = this.auth.user()?.marketing_opt_in ?? false;
  protected readonly busy = signal(false);
  protected readonly errors = signal<Record<string, string>>({});

  save(): void {
    this.busy.set(true);
    this.errors.set({});
    this.api
      .updateMe({ full_name: this.name.trim() || null, phone: this.phone.trim() || null, marketing_opt_in: this.marketing })
      .subscribe({
        next: (user) => {
          this.busy.set(false);
          this.auth.setUser(user);
          this.toast.success('Profile saved.');
        },
        error: (err) => {
          this.busy.set(false);
          this.errors.set(apiFieldErrors(err));
          this.toast.error(apiErrorMessage(err));
        },
      });
  }
}
