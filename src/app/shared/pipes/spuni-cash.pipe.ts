import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

@Pipe({ name: 'spuniCash' })
export class SpuniCashPipe implements PipeTransform {
  transform(paise: number | null | undefined, cashValuePaise = 100): string {
    if (paise === null || paise === undefined || Number.isNaN(paise) || cashValuePaise <= 0) return '';
    return `${formatter.format(paise / cashValuePaise)} Spuni Cash`;
  }
}
