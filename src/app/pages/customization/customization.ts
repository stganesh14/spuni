import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Api, apiErrorMessage } from '../../core/api/api.service';
import { Customization, CustomizationKind, ProductCard } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { SeoService } from '../../core/seo/seo.service';
import { ToastService } from '../../core/ui/toast.service';
import { safeStorage } from '../../core/utils/storage';
import { CUSTOMIZATION_WAYS } from '../../features/components/customization/customization';
import { RevealTextDirective } from '../../shared/directives/reveal-text.directive';

const DRAFT_KEY = 'spuni.custom.draft';
const MAX_FILES = 5;
const MAX_MB = 8;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface Draft {
  details: string;
  personalization: string;
  budget: string;
  contact: 'email' | 'phone' | 'whatsapp';
  phone: string;
  time: string;
  productId: number | null;
}

interface Pick {
  file: File;
  preview: string | null;
}

@Component({
  selector: 'app-customization-page',
  imports: [FormsModule, RouterLink, RevealTextDirective],
  templateUrl: './customization.html',
  styleUrl: './customization.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomizationPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  readonly mode = input<string | undefined>();
  readonly product = input<string | undefined>();

  protected readonly ways = CUSTOMIZATION_WAYS;
  protected readonly kind = signal<CustomizationKind>('catalog');
  protected readonly products = signal<ProductCard[]>([]);
  protected readonly files = signal<Pick[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<Customization | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly way = computed(() => this.ways.find((w) => w.mode === this.kind())!);

  protected draft: Draft = { details: '', personalization: '', budget: '', contact: 'email', phone: '', time: '', productId: null };

  constructor() {
    inject(SeoService).set({
      title: 'Customise',
      description: 'Personalise a SPUNI piece, upload your own design or talk to our master craftsperson.',
      path: '/customization',
    });
    const saved = safeStorage.session(DRAFT_KEY);
    if (saved) {
      try {
        this.draft = { ...this.draft, ...(JSON.parse(saved) as Partial<Draft>) };
      } catch {
        /* ignore a corrupt draft */
      }
    }
    this.api.products({ customizable: true, page_size: 60, sort: 'name' }).subscribe({
      next: (page) => {
        this.products.set(page.items);
        this.pickProductFromRoute();
      },
      error: () => undefined,
    });

    effect(() => {
      const m = this.mode();
      untracked(() => {
        if (m === 'catalog' || m === 'upload' || m === 'expert') this.kind.set(m);
      });
    });
    effect(() => {
      this.product();
      untracked(() => this.pickProductFromRoute());
    });
    inject(DestroyRef).onDestroy(() => this.files().forEach((f) => f.preview && URL.revokeObjectURL(f.preview)));
  }

  setKind(kind: CustomizationKind): void {
    this.kind.set(kind);
    this.error.set('');
    this.router.navigate([], { queryParams: { mode: kind }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  saveDraft(): void {
    safeStorage.setSession(DRAFT_KEY, JSON.stringify(this.draft));
  }

  onFiles(list: FileList | null): void {
    if (!list) return;
    const current = this.files();
    const next = [...current];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        this.toast.error(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (!TYPES.includes(file.type)) {
        this.toast.error(`${file.name}: please use JPG, PNG, WebP or PDF.`);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        this.toast.error(`${file.name} is larger than ${MAX_MB} MB.`);
        continue;
      }
      next.push({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
    }
    this.files.set(next);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.onFiles(event.dataTransfer?.files ?? null);
  }

  removeFile(i: number): void {
    const f = this.files()[i];
    if (f?.preview) URL.revokeObjectURL(f.preview);
    this.files.set(this.files().filter((_, idx) => idx !== i));
  }

  submit(): void {
    this.error.set('');
    this.saveDraft();
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: `/customization?mode=${this.kind()}` } });
      return;
    }
    const d = this.draft;
    const details = d.details.trim();
    if (details.length < 10) return this.error.set('Tell us a little more (at least 10 characters).');
    if (this.kind() === 'catalog' && !d.productId) return this.error.set('Choose the piece you would like to personalise.');
    if (this.kind() === 'upload' && !this.files().length) return this.error.set('Attach at least one sketch, photo or PDF.');
    if (d.contact !== 'email' && !/^\+?\d{10,15}$/.test(d.phone.replace(/[\s()-]/g, ''))) {
      return this.error.set('Add a valid phone number so our expert can reach you.');
    }
    const budget = d.budget ? Math.round(Number(d.budget) * 100) : null;
    if (d.budget && (!Number.isFinite(budget) || (budget ?? 0) <= 0)) return this.error.set('Enter your budget as a number.');

    const form = new FormData();
    form.append('kind', this.kind());
    form.append('details', details);
    form.append('preferred_contact', d.contact);
    if (d.productId) form.append('product_id', String(d.productId));
    if (d.personalization.trim()) form.append('personalization_text', d.personalization.trim().slice(0, 60));
    if (budget) form.append('budget_paise', String(budget));
    if (d.phone.trim()) form.append('phone', d.phone.trim());
    if (d.time.trim()) form.append('preferred_time', d.time.trim().slice(0, 80));
    for (const f of this.files()) form.append('files', f.file, f.file.name);

    this.busy.set(true);
    this.api.createCustomization(form).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.done.set(res);
        safeStorage.setSession(DRAFT_KEY, '');
        this.files.set([]);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  reset(): void {
    this.done.set(null);
    this.draft = { details: '', personalization: '', budget: '', contact: 'email', phone: '', time: '', productId: null };
  }

  private pickProductFromRoute(): void {
    const slug = this.product();
    if (!slug) return;
    const match = this.products().find((p) => p.slug === slug);
    if (match) this.draft = { ...this.draft, productId: match.id };
  }
}
