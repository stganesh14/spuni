import { Injectable, signal } from '@angular/core';

export interface ZoomImage {
  url: string;
  alt?: string | null;
}

export interface ZoomRequest {
  images: ZoomImage[];
  index: number;
  title?: string | null;
  link?: string | null;
  linkLabel?: string;
  /** Bounding box of the clicked image, for the expand-from-thumbnail animation. */
  origin?: DOMRect | null;
}

/** Opens the global image viewer (zoom in/out, pan, pinch, gallery). */
@Injectable({ providedIn: 'root' })
export class ZoomService {
  readonly request = signal<ZoomRequest | null>(null);

  open(request: ZoomRequest): void {
    if (!request.images.length) return;
    this.request.set({ ...request, index: Math.max(0, Math.min(request.index, request.images.length - 1)) });
  }

  close(): void {
    this.request.set(null);
  }
}
