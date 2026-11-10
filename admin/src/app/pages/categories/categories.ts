import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { nullIfBlank, slugify } from '../../core/format';
import { Category, CategoryIn } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { intRange, PATTERNS } from '../../core/validators';
import { ImageUpload } from '../../shared/image-upload';
import { ModalComponent } from '../../shared/modal';
import { MediaPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

function buildForm() {
  return new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)] }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(140), Validators.pattern(PATTERNS.slug)],
    }),
    tagline: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
    image_url: new FormControl<string | null>(null),
    banner_url: new FormControl<string | null>(null),
    sort_order: new FormControl('0', { nonNullable: true, validators: intRange(0, 10000) }),
    is_active: new FormControl(true, { nonNullable: true }),
    show_in_menu: new FormControl(true, { nonNullable: true }),
  });
}

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StateComponent, StatusBadge, FieldComponent, ModalComponent, ImageUpload, MediaPipe],
  templateUrl: './categories.html',
})
export class CategoriesPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly items = signal<Category[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal<Category | 'new' | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = buildForm();
  private slugTouched = false;

  constructor() {
    this.form.controls.name.valueChanges.subscribe((n) => {
      if (!this.slugTouched) this.form.controls.slug.setValue(slugify(n), { emitEvent: false });
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.categories()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected open(c: Category | 'new'): void {
    this.formError.set(null);
    if (c === 'new') {
      this.form.reset({ name: '', slug: '', tagline: '', description: '', image_url: null, banner_url: null, sort_order: String((this.items()?.length ?? 0)), is_active: true, show_in_menu: true });
      this.slugTouched = false;
    } else {
      this.form.reset({
        name: c.name,
        slug: c.slug,
        tagline: c.tagline ?? '',
        description: c.description ?? '',
        image_url: c.image_url,
        banner_url: c.banner_url,
        sort_order: String(c.sort_order),
        is_active: c.is_active,
        show_in_menu: c.show_in_menu,
      });
      this.slugTouched = true;
    }
    this.editing.set(c);
  }

  protected title(): string {
    const e = this.editing();
    return e === 'new' ? 'New category' : e ? `Edit ${e.name}` : '';
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: CategoryIn = {
      name: v.name.trim(),
      slug: v.slug.trim(),
      tagline: nullIfBlank(v.tagline),
      description: nullIfBlank(v.description),
      image_url: v.image_url,
      banner_url: v.banner_url,
      sort_order: Number(v.sort_order),
      is_active: v.is_active,
      show_in_menu: v.show_in_menu,
    };
    const e = this.editing();
    this.saving.set(true);
    this.formError.set(null);
    try {
      if (e === 'new') await firstValueFrom(this.api.createCategory(body));
      else if (e) await firstValueFrom(this.api.updateCategory(e.id, body));
      this.toast.success(e === 'new' ? `Category “${body.name}” created.` : 'Category saved.');
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

  protected async remove(c: Category): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete “${c.name}”?`,
      message:
        c.product_count > 0
          ? `This category still has ${c.product_count} product(s); the store will refuse to delete it until they are moved or deleted. Consider hiding it instead.`
          : 'This cannot be undone.',
      confirmText: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteCategory(c.id));
      this.toast.success('Category deleted.');
      void this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    }
  }

  protected onSlugInput(): void {
    this.slugTouched = true;
  }
}
