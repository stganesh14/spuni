import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { isoToLocalInput, localInputToIso, nullIfBlank, slugify } from '../../core/format';
import { Category, Launch, LaunchIn, LaunchStatus, LaunchSubscriber, Product } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { intRange, PATTERNS } from '../../core/validators';
import { ImageUpload } from '../../shared/image-upload';
import { ModalComponent } from '../../shared/modal';
import { DatePipe, MediaPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

function buildForm() {
  return new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)] }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(140), Validators.pattern(PATTERNS.slug)],
    }),
    tagline: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
    image_url: new FormControl<string | null>(null),
    launch_at: new FormControl('', { nonNullable: true }),
    status: new FormControl<LaunchStatus>('draft', { nonNullable: true }),
    category_id: new FormControl<number | null>(null),
    product_id: new FormControl<number | null>(null),
    sort_order: new FormControl('0', { nonNullable: true, validators: intRange(0, 10000) }),
  });
}

@Component({
  selector: 'app-launches',
  imports: [ReactiveFormsModule, PageHeader, StateComponent, StatusBadge, FieldComponent, ModalComponent, ImageUpload, MediaPipe, DatePipe],
  templateUrl: './launches.html',
  styleUrl: './launches.scss',
})
export class LaunchesPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly statuses: LaunchStatus[] = ['draft', 'upcoming', 'launched', 'archived'];
  protected readonly items = signal<Launch[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly products = signal<Product[]>([]);

  // edit
  protected readonly editing = signal<Launch | 'new' | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = buildForm();
  private slugTouched = false;

  // subscribers
  protected readonly subsFor = signal<Launch | null>(null);
  protected readonly subs = signal<LaunchSubscriber[] | null>(null);
  protected readonly subsError = signal<string | null>(null);
  protected readonly subsSummary = computed(() => {
    const list = this.subs() ?? [];
    return {
      total: list.length,
      active: list.filter((s) => !s.unsubscribed_at).length,
      notified: list.filter((s) => s.notified_at).length,
    };
  });

  // notify
  protected readonly notifyFor = signal<Launch | null>(null);
  protected readonly notifyMessage = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] });
  protected readonly markLaunched = new FormControl(true, { nonNullable: true });
  protected readonly notifying = signal(false);
  protected readonly notifyResult = signal<string | null>(null);

  constructor() {
    this.form.controls.title.valueChanges.subscribe((t) => {
      if (!this.slugTouched) this.form.controls.slug.setValue(slugify(t), { emitEvent: false });
    });
    void this.load();
    firstValueFrom(this.api.categories())
      .then((c) => this.categories.set(c))
      .catch(() => undefined);
    firstValueFrom(this.api.products({ page_size: 100, status: 'all' }))
      .then((p) => this.products.set(p.items))
      .catch(() => undefined);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.launches()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected categoryName(id: number | null): string {
    return id ? (this.categories().find((c) => c.id === id)?.name ?? `#${id}`) : '';
  }
  protected productName(id: number | null): string {
    return id ? (this.products().find((p) => p.id === id)?.name ?? `#${id}`) : '';
  }

  // ---------------------------------------------------------------- edit

  protected open(l: Launch | 'new'): void {
    this.formError.set(null);
    if (l === 'new') {
      this.form.reset({ title: '', slug: '', tagline: '', description: '', image_url: null, launch_at: '', status: 'draft', category_id: null, product_id: null, sort_order: '0' });
      this.slugTouched = false;
    } else {
      this.form.reset({
        title: l.title,
        slug: l.slug,
        tagline: l.tagline ?? '',
        description: l.description ?? '',
        image_url: l.image_url,
        launch_at: isoToLocalInput(l.launch_at),
        status: l.status,
        category_id: l.category_id,
        product_id: l.product_id,
        sort_order: String(l.sort_order),
      });
      this.slugTouched = true;
    }
    this.editing.set(l);
  }

  protected editTitle(): string {
    const e = this.editing();
    return e === 'new' ? 'New launch' : e ? `Edit ${e.title}` : '';
  }

  protected onSlugInput(): void {
    this.slugTouched = true;
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: LaunchIn = {
      title: v.title.trim(),
      slug: v.slug.trim(),
      tagline: nullIfBlank(v.tagline),
      description: nullIfBlank(v.description),
      image_url: v.image_url,
      launch_at: localInputToIso(v.launch_at),
      status: v.status,
      category_id: v.category_id ? Number(v.category_id) : null,
      product_id: v.product_id ? Number(v.product_id) : null,
      sort_order: Number(v.sort_order),
    };
    const e = this.editing();
    this.saving.set(true);
    this.formError.set(null);
    try {
      if (e === 'new') await firstValueFrom(this.api.createLaunch(body));
      else if (e) await firstValueFrom(this.api.updateLaunch(e.id, body));
      this.toast.success(e === 'new' ? `Launch “${body.title}” created.` : 'Launch saved.');
      this.editing.set(null);
      void this.load();
    } catch (err) {
      const ae = toApiError(err);
      applyServerErrors(this.form, ae);
      this.formError.set(ae.message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(l: Launch): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete “${l.title}”?`,
      message: `This also removes its ${l.subscriber_count} subscriber sign-up(s). This cannot be undone.`,
      confirmText: 'Delete launch',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteLaunch(l.id));
      this.toast.success('Launch deleted.');
      void this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    }
  }

  // --------------------------------------------------------- subscribers

  protected async openSubs(l: Launch): Promise<void> {
    this.subsFor.set(l);
    this.subs.set(null);
    this.subsError.set(null);
    try {
      this.subs.set(await firstValueFrom(this.api.launchSubscribers(l.id)));
    } catch (err) {
      this.subsError.set(toApiError(err).message);
    }
  }

  // --------------------------------------------------------------- notify

  protected openNotify(l: Launch): void {
    this.notifyMessage.reset('');
    this.markLaunched.reset(l.status !== 'launched' ? true : false);
    this.notifyResult.set(null);
    this.notifyFor.set(l);
  }

  protected async sendNotify(): Promise<void> {
    const l = this.notifyFor();
    if (!l || this.notifyMessage.invalid) return;
    this.notifying.set(true);
    try {
      const res = await firstValueFrom(
        this.api.notifyLaunch(l.id, { message: nullIfBlank(this.notifyMessage.value), mark_launched: this.markLaunched.value }),
      );
      this.notifyResult.set(res.message);
      this.toast.success(res.message);
      void this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.notifying.set(false);
    }
  }
}
