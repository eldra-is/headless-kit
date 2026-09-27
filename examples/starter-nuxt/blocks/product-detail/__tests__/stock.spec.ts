import { describe, expect, it } from 'vitest';
import { deriveStockLine, type StockLineInput } from '../stock';

/** In stock, tracked, with the default threshold armed — every case below changes one thing. */
const base: StockLineInput = {
  stock: 'in',
  inventory: 42,
  variantAvailable: true,
  variantLabel: 'Oat / M',
  threshold: '3',
  shipsBy: 'Tue 29 Sep',
};

describe('product-detail stock line', () => {
  it('is in stock with plenty of tracked inventory', () => {
    const line = deriveStockLine(base);
    expect(line).toMatchObject({
      state: 'in',
      tone: 'success',
      icon: 'circle-check',
      level: 'in',
      key: 'product.inStock',
      max: 42,
    });
    expect(line.noteKey).toBeUndefined();
  });

  it('is sold out when the selected combination is unavailable, naming the variant', () => {
    const line = deriveStockLine({ ...base, variantAvailable: false });
    expect(line).toMatchObject({
      state: 'out',
      tone: 'danger',
      icon: 'circle-x',
      level: 'out',
      key: 'product.soldOutIn',
      params: { variant: 'Oat / M' },
      noteKey: 'product.restockNote',
      max: 1,
    });
  });

  it('is sold out for a product the store marks out, and for zero tracked units', () => {
    expect(deriveStockLine({ ...base, stock: 'out' }).state).toBe('out');
    expect(deriveStockLine({ ...base, inventory: 0 }).state).toBe('out');
  });

  it('drops the variant from the sold-out wording for a product with no options', () => {
    const line = deriveStockLine({ ...base, variantAvailable: false, variantLabel: '' });
    expect(line.key).toBe('product.soldOut');
    expect(line.params).toBeUndefined();
  });

  it('is a back-order with the ship date for a made-to-order product', () => {
    const line = deriveStockLine({ ...base, stock: 'preorder' });
    expect(line).toMatchObject({
      state: 'backorder',
      tone: 'warning',
      icon: 'clock',
      level: 'preorder',
      key: 'product.backorderShips',
      params: { date: 'Tue 29 Sep' },
      noteKey: 'product.backorderNote',
    });
  });

  it('stays a back-order for a made-to-order product that tracks zero units on hand', () => {
    const line = deriveStockLine({ ...base, stock: 'preorder', inventory: 0 });
    expect(line.state).toBe('backorder');
    expect(line.level).toBe('preorder');
  });

  it('falls back to the undated back-order wording with no ship date', () => {
    const line = deriveStockLine({ ...base, stock: 'preorder', shipsBy: null });
    expect(line.key).toBe('product.backorderPending');
    expect(line.params).toBeUndefined();
  });

  // Spec States, Low stock row: "Never shown for made-to-order items."
  it('never reads low stock for a made-to-order product, however thin the inventory', () => {
    expect(deriveStockLine({ ...base, stock: 'preorder', inventory: 1 }).state).toBe('backorder');
  });

  it('reads low stock only at or below the threshold', () => {
    expect(deriveStockLine({ ...base, inventory: 4 }).state).toBe('in');
    expect(deriveStockLine({ ...base, inventory: 3 }).state).toBe('low');
    expect(deriveStockLine({ ...base, inventory: 3, threshold: '5' }).state).toBe('low');
    expect(deriveStockLine({ ...base, inventory: 4, threshold: '5' }).state).toBe('low');
    expect(deriveStockLine({ ...base, inventory: 10, threshold: '10' }).state).toBe('low');
    expect(deriveStockLine({ ...base, inventory: 11, threshold: '10' }).state).toBe('in');
  });

  it('never reads low stock with the threshold off, or with no tracked inventory', () => {
    expect(deriveStockLine({ ...base, inventory: 2, threshold: 'off' }).state).toBe('in');
    expect(deriveStockLine({ ...base, inventory: null }).state).toBe('in');
  });

  it('carries the count and the variant into the low-stock wording, pluralised', () => {
    expect(deriveStockLine({ ...base, inventory: 3 })).toMatchObject({
      tone: 'warning',
      icon: 'alert-triangle',
      level: 'low',
      key: 'product.lowStockManyIn',
      params: { count: 3, variant: 'Oat / M' },
      max: 3,
    });
    expect(deriveStockLine({ ...base, inventory: 1 }).key).toBe('product.lowStockOneIn');
    expect(deriveStockLine({ ...base, inventory: 1, variantLabel: '' }).key).toBe(
      'product.lowStockOne'
    );
    expect(deriveStockLine({ ...base, inventory: 2, variantLabel: '' })).toMatchObject({
      key: 'product.lowStockMany',
      params: { count: 2 },
    });
  });

  it('gives the stepper the store default maximum when nothing is tracked', () => {
    expect(deriveStockLine({ ...base, inventory: null }).max).toBe(99);
  });
});
