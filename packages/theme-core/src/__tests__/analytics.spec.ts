import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_MAX_PROPS,
  ANALYTICS_QUEUE_LIMIT,
  createAnalytics,
  normalizeAnalyticsProps,
  truncateUtf8,
  type AnalyticsSender,
} from '../analytics';

describe('normalizeAnalyticsProps', () => {
  it('stringifies values and drops null, undefined and non-finite numbers', () => {
    expect(
      normalizeAnalyticsProps({ a: 1, b: true, c: 'x', d: null, e: undefined, f: Number.NaN })
    ).toEqual({ a: '1', b: 'true', c: 'x' });
  });

  it('cuts keys to 60 bytes and values to 300 bytes', () => {
    const out = normalizeAnalyticsProps({ ['k'.repeat(80)]: 'v'.repeat(400) });
    const [[key, value]] = Object.entries(out);
    expect(key).toHaveLength(60);
    expect(value).toHaveLength(300);
  });

  it('never splits a multi-byte character', () => {
    expect(truncateUtf8('ææ', 3)).toBe('æ');
    expect(truncateUtf8('abc', 3)).toBe('abc');
  });

  it('keeps at most 30 entries', () => {
    const props = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(normalizeAnalyticsProps(props))).toHaveLength(ANALYTICS_MAX_PROPS);
  });
});

describe('createAnalytics', () => {
  it('sends through the tracker global once it exists', () => {
    const sender = vi.fn<AnalyticsSender>();
    const analytics = createAnalytics({ enabled: true, sender: () => sender });
    analytics.track('add_to_cart', { quantity: 2, note: null });
    expect(sender).toHaveBeenCalledWith('event', 'add_to_cart', { props: { quantity: '2' } });
  });

  it('queues before the script loads and flushes in order', () => {
    const loaded: { sender?: AnalyticsSender } = {};
    const analytics = createAnalytics({ enabled: true, sender: () => loaded.sender });
    analytics.track('one');
    analytics.track('two');
    analytics.flush();
    const spy = vi.fn<AnalyticsSender>();
    loaded.sender = spy;
    analytics.flush();
    expect(spy.mock.calls.map((call) => call[1])).toEqual(['one', 'two']);
    analytics.flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('bounds the queue, dropping the oldest', () => {
    const loaded: { sender?: AnalyticsSender } = {};
    const analytics = createAnalytics({ enabled: true, sender: () => loaded.sender });
    for (let i = 0; i < ANALYTICS_QUEUE_LIMIT + 5; i += 1) analytics.track(`e${i}`);
    const spy = vi.fn<AnalyticsSender>();
    loaded.sender = spy;
    analytics.flush();
    expect(spy).toHaveBeenCalledTimes(ANALYTICS_QUEUE_LIMIT);
    expect(spy.mock.calls[0]?.[1]).toBe('e5');
  });

  it('is a no-op when disabled', () => {
    const sender = vi.fn<AnalyticsSender>();
    const analytics = createAnalytics({ enabled: false, sender: () => sender });
    analytics.track('x');
    analytics.flush();
    expect(sender).not.toHaveBeenCalled();
    expect(analytics.enabled).toBe(false);
  });

  it('rejects pageview and empty names', () => {
    const sender = vi.fn<AnalyticsSender>();
    const analytics = createAnalytics({ enabled: true, sender: () => sender });
    analytics.track('pageview');
    analytics.track('  ');
    expect(sender).not.toHaveBeenCalled();
  });

  it('swallows a throwing sender', () => {
    const analytics = createAnalytics({
      enabled: true,
      sender: () => () => {
        throw new Error('boom');
      },
    });
    expect(() => analytics.track('x')).not.toThrow();
  });
});
