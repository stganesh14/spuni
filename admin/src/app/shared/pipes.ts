import { Pipe, PipeTransform, inject } from '@angular/core';
import { API_BASE, mediaUrl } from '../core/api-base';
import { formatDate, formatPaise, humanize } from '../core/format';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return formatPaise(paise);
  }
}

@Pipe({ name: 'dt' })
export class DatePipe implements PipeTransform {
  transform(iso: string | null | undefined, withTime: boolean | 'time' = false): string {
    return formatDate(iso, !!withTime);
  }
}

@Pipe({ name: 'humanize' })
export class HumanizePipe implements PipeTransform {
  transform(v: string | null | undefined): string {
    return humanize(v);
  }
}

@Pipe({ name: 'media' })
export class MediaPipe implements PipeTransform {
  private readonly base = inject(API_BASE);
  transform(url: string | null | undefined): string {
    return mediaUrl(this.base, url);
  }
}

export const PIPES = [MoneyPipe, DatePipe, HumanizePipe, MediaPipe] as const;
