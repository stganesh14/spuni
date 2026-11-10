import { formatPaise, paiseToRupees, rupeesToPaise, slugify } from './format';

describe('format helpers', () => {
  it('formats paise with Indian grouping', () => {
    expect(formatPaise(1499900)).toBe('₹14,999');
    expect(formatPaise(14999950)).toBe('₹1,49,999.50');
    expect(formatPaise(0)).toBe('₹0');
    expect(formatPaise(null)).toBe('—');
  });

  it('converts rupee input to integer paise', () => {
    expect(rupeesToPaise('14,999')).toBe(1499900);
    expect(rupeesToPaise('99.5')).toBe(9950);
    expect(rupeesToPaise('0.07')).toBe(7);
    expect(rupeesToPaise('')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
    expect(rupeesToPaise('1.234')).toBeNull();
  });

  it('round-trips paise to rupee input strings', () => {
    expect(paiseToRupees(1499900)).toBe('14999');
    expect(paiseToRupees(9950)).toBe('99.50');
    expect(rupeesToPaise(paiseToRupees(123457))).toBe(123457);
  });

  it('slugifies names', () => {
    expect(slugify('The Heritage Satchel')).toBe('the-heritage-satchel');
    expect(slugify('  Café & Co.  ')).toBe('cafe-and-co');
  });
});
