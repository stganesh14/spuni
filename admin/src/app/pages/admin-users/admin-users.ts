import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { AdminUser } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { DatePipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-admin-users',
  imports: [ReactiveFormsModule, PageHeader, StateComponent, StatusBadge, FieldComponent, DatePipe],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsersPage {
  private readonly api = inject(AdminApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly users = signal<AdminUser[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.users.set(await firstValueFrom(this.api.adminUsers()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async add(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.adding.set(true);
    try {
      const email = this.form.controls.email.value.trim().toLowerCase();
      await firstValueFrom(this.api.addAdminUser({ email }));
      this.toast.success('Admin access granted.');
      this.form.reset({ email: '' });
      await this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.adding.set(false);
    }
  }

  protected async remove(user: AdminUser): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Permanently delete ${user.email}?`,
      message: 'This removes the user account and signs them out. Accounts with store records cannot be deleted.',
      confirmText: 'Delete admin',
      danger: true,
    });
    if (!confirmed) return;

    this.deletingId.set(user.id);
    try {
      await firstValueFrom(this.api.deleteAdminUser(user.id));
      this.toast.success('Admin account deleted.');
      await this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.deletingId.set(null);
    }
  }
}
