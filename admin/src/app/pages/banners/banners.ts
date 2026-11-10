import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { nullIfBlank } from '../../core/format';
import { Banner, BannerIn } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { intRange, PATTERNS } from '../../core/validators';
import { ImageUpload } from '../../shared/image-upload';
import { ModalComponent } from '../../shared/modal';
import { MediaPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

function buildForm() {
  return new FormGroup({
    title_one: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    title_two: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    image_url: new FormControl<string | null>(null, { validators: [Validators.required] }),
    alt: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    link_url: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300), Validators.pattern(PATTERNS.link)] }),
    sort_order: new FormControl('0', { nonNullable: true, validators: intRange(0, 10000) }),
    is_active: new FormControl(true, { nonNullable: true }),
  });
}

@Component({
  selector: 'app-banners',
  imports: [ReactiveFormsModule, PageHeader, StateComponent, StatusBadge, FieldComponent, ModalComponent, ImageUpload, MediaPipe],
  templateUrl: './banners.html',
})
export class BannersPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly items = signal<Banner[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal<Banner | 'new' | null>(null);
  protected readonly saving = signal(false);
  protected readonly toggling = signal<number | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = buildForm();

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.banners()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected open(b: Banner | 'new'): void {
    this.formError.set(null);
    if (b === 'new') {
      this.form.reset({ title_one: '', title_two: '', image_url: null, alt: '', link_url: '', sort_order: String(this.items()?.length ?? 0), is_active: true });
    } else {
      this.form.reset({
        title_one: b.title_one,
        title_two: b.title_two ?? '',
        image_url: b.image_url,
        alt: b.alt ?? '',
        link_url: b.link_url ?? '',
        sort_order: String(b.sort_order),
        is_active: b.is_active,
      });
    }
    this.editing.set(b);
  }

  private body(b: Banner): BannerIn {
    return {
      title_one: b.title_one,
      title_two: b.title_two,
      image_url: b.image_url,
      alt: b.alt,
      link_url: b.link_url,
      sort_order: b.sort_order,
      is_active: b.is_active,
    };
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: BannerIn = {
      title_one: v.title_one.trim(),
      title_two: nullIfBlank(v.title_two),
      image_url: v.image_url!,
      alt: nullIfBlank(v.alt),
      link_url: nullIfBlank(v.link_url),
      sort_order: Number(v.sort_order),
      is_active: v.is_active,
    };
    const e = this.editing();
    this.saving.set(true);
    this.formError.set(null);
    try {
      if (e === 'new') await firstValueFrom(this.api.createBanner(body));
      else if (e) await firstValueFrom(this.api.updateBanner(e.id, body));
      this.toast.success(e === 'new' ? 'Banner created.' : 'Banner saved.');
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

  protected async toggle(b: Banner): Promise<void> {
    this.toggling.set(b.id);
    try {
      const updated = await firstValueFrom(this.api.updateBanner(b.id, { ...this.body(b), is_active: !b.is_active }));
      this.items.update((list) => list?.map((x) => (x.id === b.id ? updated : x)) ?? null);
      this.toast.success(updated.is_active ? 'Banner is now showing.' : 'Banner hidden.');
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.toggling.set(null);
    }
  }

  protected async remove(b: Banner): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete this banner?',
      message: `“${b.title_one} ${b.title_two ?? ''}” and its image will be removed. This cannot be undone.`,
      confirmText: 'Delete banner',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteBanner(b.id));
      this.toast.success('Banner deleted.');
      void this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    }
  }
}
