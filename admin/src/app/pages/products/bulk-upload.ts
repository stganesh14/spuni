import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { FieldError, toApiError } from '../../core/errors';
import { BulkProductUploadResult } from '../../core/models';
import { ToastService } from '../../core/ui.service';
import { PageHeader } from '../../shared/ui';

@Component({
  selector: 'app-bulk-product-upload',
  imports: [PageHeader],
  templateUrl: './bulk-upload.html',
})
export class BulkProductUploadPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);

  protected readonly workbook = signal<File | null>(null);
  protected readonly images = signal<File[]>([]);
  protected readonly downloading = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly details = signal<FieldError[]>([]);
  protected readonly result = signal<BulkProductUploadResult | null>(null);

  protected selectWorkbook(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && !file.name.toLowerCase().endsWith('.xlsx')) {
      this.error.set('Choose an .xlsx Excel template.');
      this.workbook.set(null);
      input.value = '';
      return;
    }
    this.error.set(null);
    this.details.set([]);
    this.result.set(null);
    this.workbook.set(file);
  }

  protected selectImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.error.set(null);
    this.details.set([]);
    this.result.set(null);
    this.images.set(files);
  }

  protected async downloadTemplate(): Promise<void> {
    this.downloading.set(true);
    this.error.set(null);
    try {
      const blob = await firstValueFrom(this.api.bulkProductTemplate());
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'spuni-bulk-products-template.xlsx';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.downloading.set(false);
    }
  }

  protected async upload(): Promise<void> {
    const workbook = this.workbook();
    if (!workbook) {
      this.error.set('Select the completed Excel template first.');
      return;
    }
    this.uploading.set(true);
    this.error.set(null);
    this.details.set([]);
    this.result.set(null);
    try {
      const result = await firstValueFrom(this.api.bulkUploadProducts(workbook, this.images()));
      this.result.set(result);
      if (result.failed) {
        this.toast.error(`${result.created} product(s) created; ${result.failed} failed. Review the error list.`);
      } else {
        this.toast.success(`${result.created} product${result.created === 1 ? '' : 's'} created.`);
      }
    } catch (err) {
      const apiError = toApiError(err);
      this.error.set(apiError.message);
      this.details.set(apiError.fields);
    } finally {
      this.uploading.set(false);
    }
  }
}
