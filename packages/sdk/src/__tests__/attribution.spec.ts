import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCampaignAttribution,
  clearCampaignAttribution,
  createEldraClient,
  EldraHttpError,
  readCampaignAttribution,
} from '../index';
import type { EldraHttpRequest, EldraKeyValueStorage } from '../index';
import { stubHttpClient } from './support';

const KEY = 'eldra.campaignAttribution';
const CAMPAIGN_ID = '0b9f8a52-3c1d-4e6f-9a7b-2c4d6e8f0a1b';
const DAY = 24 * 60 * 60 * 1000;
const LANDING =
  'https://shop.example/vorur?utm_source=eldra&utm_medium=email&utm_campaign=haustutsala' +
  `&utm_id=${CAMPAIGN_ID}`;

function memoryStorage(): EldraKeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('captureCampaignAttribution', () => {
  it('stores the four campaign tags with the time they were captured', () => {
    const storage = memoryStorage();

    const captured = captureCampaignAttribution(LANDING, { storage });

    const expected = {
      campaignId: CAMPAIGN_ID,
      utmSource: 'eldra',
      utmMedium: 'email',
      utmCampaign: 'haustutsala',
    };
    expect(captured).toEqual(expected);
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({
      ...expected,
      capturedAt: Date.parse('2026-10-28T12:00:00Z'),
      expiresAt: Date.parse('2026-10-28T12:00:00Z') + 30 * DAY,
    });
    expect(readCampaignAttribution({ storage })).toEqual(expected);
  });

  it('stores nothing but the campaign tags, whatever else the URL carries', () => {
    const storage = memoryStorage();

    captureCampaignAttribution(
      `${LANDING}&gclid=abc&fbclid=def&utm_term=shoes&utm_content=hero&email=jon%40example.is`,
      { storage }
    );

    expect(Object.keys(JSON.parse(storage.data.get(KEY)!)).sort()).toEqual([
      'campaignId',
      'capturedAt',
      'expiresAt',
      'utmCampaign',
      'utmMedium',
      'utmSource',
    ]);
  });

  it('keeps utm_id as the campaign id only when it is a uuid', () => {
    const storage = memoryStorage();

    expect(captureCampaignAttribution('/?utm_source=google&utm_id=12345', { storage })).toEqual({
      utmSource: 'google',
    });
    expect(
      captureCampaignAttribution(`/?utm_id=${CAMPAIGN_ID.toUpperCase()}`, { storage })
    ).toEqual({ campaignId: CAMPAIGN_ID });
  });

  it('leaves the earlier landing alone when a URL carries no usable tag', () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });
    const before = storage.data.get(KEY);

    expect(captureCampaignAttribution('https://shop.example/karfa', { storage })).toBeNull();
    expect(
      captureCampaignAttribution('/?utm_id=not-a-uuid&utm_source=%20', { storage })
    ).toBeNull();
    expect(captureCampaignAttribution('not a url at all ::', { storage })).toBeNull();

    expect(storage.data.get(KEY)).toBe(before);
  });

  it('replaces an earlier landing whole, never merging two landings into one', () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });
    vi.advanceTimersByTime(DAY);

    captureCampaignAttribution('/vara/skor?utm_source=facebook&utm_medium=social', { storage });

    expect(readCampaignAttribution({ storage })).toEqual({
      utmSource: 'facebook',
      utmMedium: 'social',
    });
    expect(JSON.parse(storage.data.get(KEY)!).capturedAt).toBe(Date.parse('2026-10-29T12:00:00Z'));
  });

  it('trims each tag and cuts it to 100 characters, as the gateway does', () => {
    const storage = memoryStorage();
    const hundredIcelandic = 'þ'.repeat(100);
    const hundredEmoji = '🎃'.repeat(100);

    expect(
      captureCampaignAttribution(
        `/?utm_source=${encodeURIComponent(` ${hundredIcelandic} `)}` +
          `&utm_medium=${encodeURIComponent(hundredEmoji + '🎃')}` +
          `&utm_campaign=${'a'.repeat(101)}`,
        { storage }
      )
    ).toEqual({
      utmSource: hundredIcelandic,
      utmMedium: hundredEmoji,
      utmCampaign: 'a'.repeat(100),
    });
  });

  it('drops control characters, so a link cannot stop the cart from saving', () => {
    const storage = memoryStorage();

    expect(
      captureCampaignAttribution('/?utm_source=%00&utm_medium=e%00mail%0A', { storage })
    ).toEqual({ utmMedium: 'email' });
  });

  it('drops a tag holding an email address', () => {
    const storage = memoryStorage();

    expect(
      captureCampaignAttribution('/?utm_source=news&utm_campaign=jon%40example.is', { storage })
    ).toEqual({ utmSource: 'news' });
  });
});

describe('readCampaignAttribution', () => {
  it('forgets a landing once 30 days have passed', () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });

    vi.advanceTimersByTime(30 * DAY - 1);
    expect(readCampaignAttribution({ storage })).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(readCampaignAttribution({ storage })).toBeNull();
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('honours a shorter window chosen at capture', () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage, maxAgeMs: DAY });

    vi.advanceTimersByTime(DAY);

    expect(readCampaignAttribution({ storage })).toBeNull();
  });

  it('returns only valid campaign tags from a stored value, and drops one it cannot read', () => {
    const storage = memoryStorage();
    const expiresAt = Date.now() + DAY;
    storage.data.set(
      KEY,
      JSON.stringify({ utmSource: 'eldra', email: 'jon@example.is', campaignId: 'x', expiresAt })
    );
    expect(readCampaignAttribution({ storage })).toEqual({ utmSource: 'eldra' });

    for (const broken of ['{', '"eldra"', JSON.stringify({ utmSource: 'eldra' })]) {
      storage.data.set(KEY, broken);
      expect(readCampaignAttribution({ storage })).toBeNull();
      expect(storage.data.has(KEY)).toBe(false);
    }
  });
});

describe('clearCampaignAttribution', () => {
  it('forgets the landing', () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });

    clearCampaignAttribution({ storage });

    expect(readCampaignAttribution({ storage })).toBeNull();
  });
});

describe('where it is kept', () => {
  it('uses the browser’s localStorage and location by default', () => {
    const local = memoryStorage();
    vi.stubGlobal('document', {});
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('location', { href: LANDING });

    captureCampaignAttribution();

    expect(local.data.has(KEY)).toBe(true);
    expect(readCampaignAttribution()?.campaignId).toBe(CAMPAIGN_ID);
  });

  it('keeps nothing on a server, even one that has a localStorage', () => {
    const shared = memoryStorage();
    vi.stubGlobal('localStorage', shared);

    expect(captureCampaignAttribution(LANDING)).toEqual(
      expect.objectContaining({ utmSource: 'eldra' })
    );
    expect(shared.data.size).toBe(0);
    expect(readCampaignAttribution()).toBeNull();
  });

  it('does nothing when there is no URL to read', () => {
    expect(captureCampaignAttribution()).toBeNull();
  });

  it('never throws when storage refuses', () => {
    const refusing: EldraKeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    expect(() => captureCampaignAttribution(LANDING, { storage: refusing })).not.toThrow();
    expect(readCampaignAttribution({ storage: refusing })).toBeNull();
    expect(() => clearCampaignAttribution({ storage: refusing })).not.toThrow();
  });
});

describe('cart.addItem carries the landing', () => {
  const item = { productId: 'prod-1', variantId: 'var-1', quantity: 1 };

  function recording(
    options: Parameters<typeof createEldraClient>[0] = {},
    answer: (request: EldraHttpRequest) => unknown = () => ({ id: 'cart-1' })
  ) {
    const bodies: unknown[] = [];
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      ...options,
      httpClient: stubHttpClient((request) => {
        bodies.push(JSON.parse(request.body as string));
        return answer(request);
      }),
    });
    return { client, bodies };
  }

  it('sends the stored landing as attribution', async () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });
    const { client, bodies } = recording({ campaignAttribution: { storage } });

    await client.cart.addItem(item);

    expect(bodies).toEqual([
      {
        ...item,
        attribution: {
          campaignId: CAMPAIGN_ID,
          utmSource: 'eldra',
          utmMedium: 'email',
          utmCampaign: 'haustutsala',
        },
      },
    ]);
  });

  it('reads the browser’s localStorage when given no storage', async () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('localStorage', memoryStorage());
    captureCampaignAttribution(LANDING);
    const { client, bodies } = recording();

    await client.cart.addItem(item);

    expect(bodies[0]).toHaveProperty('attribution.campaignId', CAMPAIGN_ID);
  });

  it('sends none when nothing is stored, the landing expired, or the client opts out', async () => {
    const storage = memoryStorage();
    const { client, bodies } = recording({ campaignAttribution: { storage } });
    await client.cart.addItem(item);

    captureCampaignAttribution(LANDING, { storage });
    vi.advanceTimersByTime(30 * DAY);
    await client.cart.addItem(item);

    captureCampaignAttribution(LANDING, { storage });
    const optedOut = recording({ campaignAttribution: false });
    vi.stubGlobal('document', {});
    vi.stubGlobal('localStorage', storage);
    await optedOut.client.cart.addItem(item);

    expect([...bodies, ...optedOut.bodies]).toEqual([item, item, item]);
  });

  it('leaves an attribution the caller passed alone', async () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });
    const { client, bodies } = recording({ campaignAttribution: { storage } });

    const own = { ...item, attribution: { utmSource: 'pos' } };
    await client.cart.addItem(own);

    expect(bodies).toEqual([own]);
  });

  it('adds the item without it when the gateway refuses the field', async () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });
    const refusal = {
      status: 422,
      code: 'VALIDATION',
      detail: 'validation failed',
      errors: {
        messages: [
          'unexpected property (body.attribution: map[campaignId:0b9f8a52 utmSource:eldra])',
        ],
      },
    };
    const { client, bodies } = recording({ campaignAttribution: { storage } }, (request) => {
      if (JSON.parse(request.body as string).attribution) {
        throw new EldraHttpError(new Response(null, { status: 422 }), refusal);
      }
      return { id: 'cart-1' };
    });

    await expect(client.cart.addItem(item)).resolves.toEqual({ id: 'cart-1' });

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(item);
  });

  it('does not retry a refusal that is about something else', async () => {
    const storage = memoryStorage();
    captureCampaignAttribution(LANDING, { storage });
    const refusal = {
      status: 422,
      errors: { messages: ['expected number >= 1 (body.quantity: 0)'] },
    };
    const { client, bodies } = recording({ campaignAttribution: { storage } }, () => {
      throw new EldraHttpError(new Response(null, { status: 422 }), refusal);
    });

    await expect(client.cart.addItem(item)).rejects.toBeInstanceOf(EldraHttpError);

    expect(bodies).toHaveLength(1);
  });
});
