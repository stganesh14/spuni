import { Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, FieldError, toApiError } from '../../core/errors';
import { nullIfBlank, paiseToRupees, rupeesToPaise, slugify } from '../../core/format';
import { Category, Gender, Product, ProductIn } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { intRange, PATTERNS, rupees } from '../../core/validators';
import { GalleryImage, ImageManager } from '../../shared/image-upload';
import { FieldComponent, PageHeader, StateComponent } from '../../shared/ui';

const text = (max: number, min = 0, required = false) =>
  new FormControl('', {
    nonNullable: true,
    validators: [
      ...(required ? [Validators.required] : []),
      ...(min ? [Validators.minLength(min)] : []),
      Validators.maxLength(max),
    ],
  });

function buildForm() {
  return new FormGroup(
    {
      category_id: new FormControl<number | null>(null, { validators: [Validators.required] }),
      name: text(120, 2, true),
      slug: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2), Validators.maxLength(140), Validators.pattern(PATTERNS.slug)],
      }),
      sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(PATTERNS.sku)] }),
      short_description: text(280),
      description: text(8000),
      price: new FormControl('', { nonNullable: true, validators: [rupees({ required: true })] }),
      compare_at_price: new FormControl('', { nonNullable: true, validators: [rupees()] }),
      stock: new FormControl('0', { nonNullable: true, validators: intRange(0, 1_000_000) }),
      gender: new FormControl<Gender>('unisex', { nonNullable: true }),
      material: text(120),
      color: text(60),
      dimensions: text(120),
      weight_grams: new FormControl('', { nonNullable: true, validators: intRange(1, 100_000, false) }),
      care_instructions: text(2000),
      badge: text(30),
      is_active: new FormControl(true, { nonNullable: true }),
      is_featured: new FormControl(false, { nonNullable: true }),
      is_bestseller: new FormControl(false, { nonNullable: true }),
      is_customizable: new FormControl(false, { nonNullable: true }),
      sort_order: new FormControl('0', { nonNullable: true, validators: intRange(0, 10000) }),
      meta_title: text(160),
      meta_description: text(300),
    },
    { validators: [compareAtValidator] },
  );
}

function compareAtValidator(g: unknown): ValidationErrors | null {
  const group = g as FormGroup;
  const price = rupeesToPaise(group.get('price')?.value);
  const cmp = rupeesToPaise(group.get('compare_at_price')?.value);
  const ctrl = group.get('compare_at_price');
  if (!ctrl) return null;
  const has = !!ctrl.errors?.['compareAt'];
  if (price !== null && cmp !== null && cmp <= price) {
    if (!has) ctrl.setErrors({ ...(ctrl.errors ?? {}), compareAt: 'Compare-at price must be higher than the price.' });
  } else if (has) {
    const { compareAt: _, ...rest } = ctrl.errors ?? {};
    ctrl.setErrors(Object.keys(rest).length ? rest : null);
  }
  return null;
}

type ProductForm = ReturnType<typeof buildForm>;

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StateComponent, FieldComponent, ImageManager],
  templateUrl: './product-form.html',
})
export class ProductFormPage {
  /** Route param (`new` route has none). */
  readonly id = input<string | undefined>(undefined);

  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly form: ProductForm = buildForm();
  protected readonly images = signal<GalleryImage[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly product = signal<Product | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly unmatched = signal<FieldError[]>([]);
  private slugTouched = false;

  constructor() {
    this.form.controls.name.valueChanges.subscribe((name) => {
      if (!this.slugTouched) this.form.controls.slug.setValue(slugify(name), { emitEvent: false });
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected get isNew(): boolean {
    return !this.id();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [cats, product] = await Promise.all([
        firstValueFrom(this.api.categories()),
        this.isNew ? Promise.resolve(null) : firstValueFrom(this.api.product(Number(this.id()))),
      ]);
      this.categories.set(cats);
      if (product) {
        this.product.set(product);
        this.patch(product);
        this.slugTouched = true;
      }
    } catch (err) {
      this.loadError.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  private patch(p: Product): void {
    this.form.reset({
      category_id: p.category_id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      short_description: p.short_description ?? '',
      description: p.description ?? '',
      price: paiseToRupees(p.price_paise),
      compare_at_price: paiseToRupees(p.compare_at_price_paise),
      stock: String(p.stock),
      gender: p.gender,
      material: p.material ?? '',
      color: p.color ?? '',
      dimensions: p.dimensions ?? '',
      weight_grams: p.weight_grams ? String(p.weight_grams) : '',
      care_instructions: p.care_instructions ?? '',
      badge: p.badge ?? '',
      is_active: p.is_active,
      is_featured: p.is_featured,
      is_bestseller: p.is_bestseller,
      is_customizable: p.is_customizable,
      sort_order: String(p.sort_order),
      meta_title: p.meta_title ?? '',
      meta_description: p.meta_description ?? '',
    });
    this.images.set(p.images.map((i) => ({ url: i.url, alt: i.alt })));
  }

  protected onSlugInput(): void {
    this.slugTouched = true;
  }

  protected regenerateSlug(): void {
    this.form.controls.slug.setValue(slugify(this.form.controls.name.value));
    this.form.controls.slug.markAsTouched();
  }

  protected onSkuInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const upper = el.value.toUpperCase().replace(/\s+/g, '-');
    if (upper !== el.value) {
      const pos = el.selectionStart;
      this.form.controls.sku.setValue(upper);
      el.value = upper;
      if (pos !== null) el.setSelectionRange(pos, pos);
    }
  }

  protected ctrl(name: keyof ProductForm['controls']) {
    return this.form.controls[name];
  }

  private payload(): ProductIn {
    const v = this.form.getRawValue();
    return {
      category_id: Number(v.category_id),
      name: v.name.trim(),
      slug: v.slug.trim(),
      sku: v.sku.trim().toUpperCase(),
      short_description: nullIfBlank(v.short_description),
      description: nullIfBlank(v.description),
      price_paise: rupeesToPaise(v.price) ?? 0,
      compare_at_price_paise: rupeesToPaise(v.compare_at_price),
      stock: Number(v.stock),
      gender: v.gender,
      material: nullIfBlank(v.material),
      color: nullIfBlank(v.color),
      dimensions: nullIfBlank(v.dimensions),
      weight_grams: v.weight_grams.trim() ? Number(v.weight_grams) : null,
      care_instructions: nullIfBlank(v.care_instructions),
      badge: nullIfBlank(v.badge),
      is_active: v.is_active,
      is_featured: v.is_featured,
      is_bestseller: v.is_bestseller,
      is_customizable: v.is_customizable,
      sort_order: Number(v.sort_order),
      meta_title: nullIfBlank(v.meta_title),
      meta_description: nullIfBlank(v.meta_description),
      images: this.images().map((i) => ({ url: i.url, alt: nullIfBlank(i.alt) })),
    };
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.unmatched.set([]);
    if (this.form.invalid) {
      this.formError.set('Please fix the highlighted fields.');
      setTimeout(() => (document.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea') as HTMLElement | null)?.focus());
      return;
    }
    this.saving.set(true);
    try {
      const body = this.payload();
      const saved = this.isNew
        ? await firstValueFrom(this.api.createProduct(body))
        : await firstValueFrom(this.api.updateProduct(Number(this.id()), body));
      this.toast.success(this.isNew ? `Product “${saved.name}” created.` : 'Product saved.');
      this.product.set(saved);
      this.form.markAsPristine();
      if (this.isNew) await this.router.navigate(['/products', saved.id], { replaceUrl: true });
      else this.patch(saved);
    } catch (err) {
      const e = toApiError(err);
      const rest = applyServerErrors(this.form, e, {
        price_paise: 'price',
        compare_at_price_paise: 'compare_at_price',
      });
      this.unmatched.set(rest.filter((f) => f.message));
      this.formError.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const p = this.product();
    if (!p) return;
    const ok = await this.confirm.ask({
      title: `Delete “${p.name}”?`,
      message: 'Products that appear in orders are archived (hidden) instead of deleted.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteProduct(p.id));
      this.toast.success('Product removed (or archived if it has orders).');
      await this.router.navigate(['/products']);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    }
  }
}
