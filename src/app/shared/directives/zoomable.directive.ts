import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

import { ZoomImage, ZoomService } from '../../core/ui/zoom.service';

/**
 * Click (or Enter) on any product/category image to open it in the zoom viewer.
 * Usage: <img [appZoomable]="url" [zoomGallery]="images" [zoomIndex]="i" zoomTitle="..." zoomLink="/product/x">
 */
@Directive({
  selector: '[appZoomable]',
  host: {
    role: 'button',
    tabindex: '0',
    '[attr.aria-label]': '"Zoom image: " + (zoomTitle() || "")',
  },
})
export class ZoomableDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zoom = inject(ZoomService);

  readonly appZoomable = input<string | null | undefined>(null);
  readonly zoomGallery = input<ZoomImage[] | null>(null);
  readonly zoomIndex = input(0);
  readonly zoomTitle = input<string | null>(null);
  readonly zoomLink = input<string | null>(null);
  readonly zoomLinkLabel = input('View product');

  @HostListener('click', ['$event'])
  @HostListener('keydown.enter', ['$event'])
  open(event: Event): void {
    const src = this.appZoomable();
    const gallery = this.zoomGallery();
    if (!src && !gallery?.length) return;
    event.preventDefault();
    event.stopPropagation();
    const images = gallery?.length ? gallery : [{ url: src as string, alt: this.zoomTitle() }];
    this.zoom.open({
      images,
      index: gallery?.length ? this.zoomIndex() : 0,
      title: this.zoomTitle(),
      link: this.zoomLink(),
      linkLabel: this.zoomLinkLabel(),
      origin: this.el.nativeElement.getBoundingClientRect(),
    });
  }
}
