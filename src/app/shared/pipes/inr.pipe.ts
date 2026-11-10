import { Pipe, PipeTransform } from '@angular/core';

import { formatPaise } from '../../core/utils/money';

/** `{{ product.price_paise | inr }}` -> ₹14,999 */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return formatPaise(paise);
  }
}
