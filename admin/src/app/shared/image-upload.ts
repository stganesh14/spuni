import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, forwardRef, inject, input, model, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../core/api.service';
import { toApiError } from '../core/errors';
import { MediaFolder } from '../core/models';
import { ToastService } from '../core/ui.service';
import { MediaPipe } from './pipes';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif';
let seq = 0;

/** Single image field (form control holding the uploaded `/media/...` URL or null). */
@Component({
  selector: 'app-image-upload',
  imports: [MediaPipe],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ImageUpload), multi: true }],
  template: `
    <div class="image-upload" [class.has-image]="!!value()" [class.wide]="aspect() === 'wide'">
      @if (value(); as url) {
        <img [src]="url | media" [alt]="alt() || 'Uploaded image preview'" />
      } @else {
        <div class="image-placeholder" aria-hidden="true">No image</div>
      }
      <div class="image-upload-actions">
        <label class="btn btn-ghost btn-sm" [class.disabled]="busy() || disabled()" [attr.for]="inputId">
          {{ busy() ? 'Uploading…' : value() ? 'Replace' : 'Upload image' }}
        </label>
        <input
          [id]="inputId"
          class="visually-hidden"
          type="file"
          [accept]="accept"
          [disabled]="busy() || disabled()"
          (change)="onFile($event)"
        />
        @if (value() && !required()) {
          <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy() || disabled()" (click)="set(null)">
            Remove
          </button>
        }
      </div>
    </div>
  `,
})
export class ImageUpload implements ControlValueAccessor {
  readonly folder = input.required<MediaFolder>();
  readonly alt = input('');
  readonly required = input(false);
  readonly aspect = input<'square' | 'wide'>('square');
  protected readonly accept = ACCEPT;
  protected readonly inputId = `image-upload-${++seq}`;
  protected readonly value = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly disabled = signal(false);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: string | null): void {
    this.value.set(v || null);
  }
  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }

  protected set(v: string | null): void {
    this.value.set(v);
    this.onChange(v);
    this.onTouched();
  }

  protected async onFile(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.upload(this.folder(), file));
      this.set(res.url);
    } catch (err) {
      this.toast.error(`Upload failed: ${toApiError(err).message}`);
    } finally {
      this.busy.set(false);
    }
  }
}

export interface GalleryImage {
  url: string;
  alt: string | null;
}

/** Product image manager: multi-upload, drag or button reorder, alt text, remove. First = primary. */
@Component({
  selector: 'app-image-manager',
  imports: [MediaPipe, CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    <div class="gallery-toolbar">
      <label class="btn btn-ghost" [class.disabled]="uploading() > 0 || images().length >= max()" [attr.for]="inputId">
        {{ uploading() > 0 ? 'Uploading ' + uploading() + '…' : 'Add images' }}
      </label>
      <input
        [id]="inputId"
        class="visually-hidden"
        type="file"
        multiple
        [accept]="accept"
        [disabled]="uploading() > 0 || images().length >= max()"
        (change)="onFiles($event)"
      />
      <span class="muted small">{{ images().length }} / {{ max() }} · drag to reorder · first image is the primary</span>
    </div>
    @if (images().length === 0) {
      <p class="muted gallery-empty">No images yet. Upload JPG, PNG or WebP files.</p>
    }
    <ol class="gallery" cdkDropList (cdkDropListDropped)="drop($event)" aria-label="Product images">
      @for (img of images(); track img.url; let i = $index; let last = $last) {
        <li class="gallery-item" cdkDrag>
          <button type="button" class="drag-handle" cdkDragHandle aria-label="Drag to reorder">⋮⋮</button>
          <img [src]="img.url | media" [alt]="img.alt || 'Product image ' + (i + 1)" />
          <div class="gallery-meta">
            @if (i === 0) {
              <span class="badge" data-tone="ok">Primary</span>
            }
            <label class="visually-hidden" [attr.for]="inputId + '-alt-' + i">Alt text for image {{ i + 1 }}</label>
            <input
              [id]="inputId + '-alt-' + i"
              class="input input-sm"
              type="text"
              maxlength="160"
              placeholder="Alt text (describe the image)"
              [value]="img.alt ?? ''"
              (input)="setAlt(i, $any($event.target).value)"
            />
          </div>
          <div class="gallery-actions">
            <button type="button" class="icon-btn" [disabled]="i === 0" (click)="move(i, i - 1)" [attr.aria-label]="'Move image ' + (i + 1) + ' up'">↑</button>
            <button type="button" class="icon-btn" [disabled]="last" (click)="move(i, i + 1)" [attr.aria-label]="'Move image ' + (i + 1) + ' down'">↓</button>
            <button type="button" class="icon-btn danger" (click)="remove(i)" [attr.aria-label]="'Remove image ' + (i + 1)">✕</button>
          </div>
        </li>
      }
    </ol>
  `,
})
export class ImageManager {
  readonly images = model<GalleryImage[]>([]);
  readonly folder = input<MediaFolder>('products');
  readonly max = input(12);
  protected readonly accept = ACCEPT;
  protected readonly inputId = `image-manager-${++seq}`;
  protected readonly uploading = signal(0);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);

  protected async onFiles(e: Event): Promise<void> {
    const el = e.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    const room = this.max() - this.images().length;
    if (files.length > room) this.toast.show(`Only ${room} more image(s) can be added.`, 'info');
    for (const file of files.slice(0, room)) {
      this.uploading.update((n) => n + 1);
      try {
        const res = await firstValueFrom(this.api.upload(this.folder(), file));
        this.images.update((list) => [...list, { url: res.url, alt: null }]);
      } catch (err) {
        this.toast.error(`${file.name}: ${toApiError(err).message}`);
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
  }

  protected drop(e: CdkDragDrop<unknown>): void {
    this.move(e.previousIndex, e.currentIndex);
  }

  protected move(from: number, to: number): void {
    if (to < 0 || to >= this.images().length || from === to) return;
    const list = [...this.images()];
    moveItemInArray(list, from, to);
    this.images.set(list);
  }

  protected setAlt(i: number, alt: string): void {
    this.images.update((list) => list.map((img, j) => (j === i ? { ...img, alt: alt || null } : img)));
  }

  protected remove(i: number): void {
    this.images.update((list) => list.filter((_, j) => j !== i));
  }
}
