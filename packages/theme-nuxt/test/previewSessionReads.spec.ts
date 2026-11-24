/**
 * Which async data a draft preview session reads again after hydration (`previewSessionReads.ts`,
 * WS-1358): every entry hydrated from the published payload, and the route read Nuxt counted as
 * hydrated from its `default` on a page only the draft has — never an entry the page runs itself.
 */
import { describe, expect, it } from 'vitest';
import {
  PAGE_KEY_PREFIX,
  sessionReads,
  type SessionAsyncDataEntry,
} from '../src/runtime/previewSessionReads';

const EMPTY_ROUTE = { page: null, template: null, entry: null };

function entry(value: unknown, status: string, fallback: () => unknown): SessionAsyncDataEntry {
  return { data: { value }, status: { value: status }, _default: fallback };
}

describe('sessionReads', () => {
  it('reads again every key the payload carried', () => {
    const { reread, inFlight } = sessionReads({
      hydratedKeys: ['eldra-page:/', 'site-nav'],
      asyncData: {
        'eldra-page:/': entry({ page: { id: 'home' } }, 'success', () => EMPTY_ROUTE),
        'site-nav': entry(['a'], 'success', () => []),
      },
      promises: {},
    });
    expect(reread).toEqual(['eldra-page:/', 'site-nav']);
    expect(inFlight).toEqual([]);
  });

  it('reads a route Nuxt counted as hydrated from its default (a draft-only page)', () => {
    const { reread } = sessionReads({
      hydratedKeys: ['site-nav'],
      asyncData: {
        'site-nav': entry(['a'], 'success', () => []),
        [`${PAGE_KEY_PREFIX}/draft-only`]: entry(EMPTY_ROUTE, 'success', () => EMPTY_ROUTE),
      },
      promises: {},
    });
    expect(reread).toEqual(['site-nav', 'eldra-page:/draft-only']);
  });

  it('compares the default by value as well as by identity', () => {
    const { reread } = sessionReads({
      hydratedKeys: [],
      asyncData: {
        'eldra-page:/draft-only': entry({ ...EMPTY_ROUTE }, 'success', () => ({ ...EMPTY_ROUTE })),
      },
      promises: {},
    });
    expect(reread).toEqual(['eldra-page:/draft-only']);
  });

  it('does not run a cart create on mount a second time', () => {
    const cart = { id: 'cart-1', lines: [] };
    // Finished before the session read: it has its own answer, not its default.
    const finished = sessionReads({
      hydratedKeys: [],
      asyncData: { cart: entry(cart, 'success', () => null) },
      promises: {},
    });
    expect(finished.reread).toEqual([]);
    // Still running: waited for, not run again.
    const running = Promise.resolve(cart);
    const pending = sessionReads({
      hydratedKeys: [],
      asyncData: { cart: entry(null, 'pending', () => null) },
      promises: { cart: running },
    });
    expect(pending.reread).toEqual([]);
    expect(pending.inFlight).toEqual([running]);
  });

  it('never runs an immediate: false entry Nuxt marked hydrated from its default', () => {
    // Nuxt marks it `success` with its default exactly as it marks a route read; only the page
    // runs it.
    const { reread } = sessionReads({
      hydratedKeys: [],
      asyncData: {
        'create-cart': entry(null, 'success', () => null),
        'newsletter-submit': entry({ ok: false }, 'success', () => ({ ok: false })),
        'eldra-page:/never-ran': entry(EMPTY_ROUTE, 'idle', () => EMPTY_ROUTE),
      },
      promises: {},
    });
    expect(reread).toEqual([]);
  });

  it('leaves a route read that already has its own answer', () => {
    const { reread } = sessionReads({
      hydratedKeys: [],
      asyncData: {
        'eldra-page:/read': entry({ page: { id: 'p' } }, 'success', () => EMPTY_ROUTE),
      },
      promises: {},
    });
    expect(reread).toEqual([]);
  });
});
