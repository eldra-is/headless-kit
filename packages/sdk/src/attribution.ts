import { browserStorage, safeRead, safeWrite, type EldraKeyValueStorage } from './storage';

/** The campaign a visit landed from: campaign-level tags only, nothing about the visitor. */
export interface EldraCampaignAttribution {
  /** The Eldra campaign's id: the landing URL's `utm_id`, kept only when it is a uuid. */
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface EldraCampaignAttributionOptions {
  /** Where the landing is kept. Defaults to `localStorage` in a browser and to nothing elsewhere. */
  storage?: EldraKeyValueStorage | null;
  /** How long a landing counts, from when it is captured. Defaults to 30 days. */
  maxAgeMs?: number;
}

interface StoredAttribution extends EldraCampaignAttribution {
  capturedAt: number;
  expiresAt: number;
}

const STORAGE_KEY = 'eldra.campaignAttribution';
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TAG_LENGTH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Remembers the campaign tags `url` (default `location.href`) carries, replacing any earlier landing; `null` when none. */
export function captureCampaignAttribution(
  url?: string | URL,
  options: EldraCampaignAttributionOptions = {}
): EldraCampaignAttribution | null {
  const params = searchParamsOf(url ?? currentHref());
  if (params === null) return null;
  const attribution = toAttribution({
    campaignId: params.get('utm_id'),
    utmSource: params.get('utm_source'),
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
  });
  if (attribution === null) return null;
  const capturedAt = Date.now();
  const stored: StoredAttribution = {
    ...attribution,
    capturedAt,
    expiresAt: capturedAt + (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS),
  };
  safeWrite(storageOf(options), STORAGE_KEY, JSON.stringify(stored));
  return attribution;
}

/** The remembered landing, or `null` when there is none or it has expired. */
export function readCampaignAttribution(
  options: Pick<EldraCampaignAttributionOptions, 'storage'> = {}
): EldraCampaignAttribution | null {
  const storage = storageOf(options);
  const raw = safeRead(storage, STORAGE_KEY);
  if (raw === null) return null;
  const stored = parseStored(raw);
  const attribution =
    stored !== null && typeof stored.expiresAt === 'number' && Date.now() < stored.expiresAt
      ? toAttribution(stored)
      : null;
  if (attribution === null) safeWrite(storage, STORAGE_KEY, null);
  return attribution;
}

/** Forgets the remembered landing, so later carts carry none until the next tagged landing. */
export function clearCampaignAttribution(
  options: Pick<EldraCampaignAttributionOptions, 'storage'> = {}
): void {
  safeWrite(storageOf(options), STORAGE_KEY, null);
}

function storageOf(options: {
  storage?: EldraKeyValueStorage | null;
}): EldraKeyValueStorage | null {
  if (options.storage !== undefined) return options.storage;
  // A server's localStorage (Node's, when enabled) is shared by every visitor it serves.
  return typeof (globalThis as { document?: unknown }).document === 'undefined'
    ? null
    : browserStorage('localStorage');
}

function currentHref(): string | undefined {
  const href = (globalThis as { location?: { href?: unknown } }).location?.href;
  return typeof href === 'string' ? href : undefined;
}

function searchParamsOf(url: string | URL | undefined): URLSearchParams | null {
  if (url === undefined) return null;
  try {
    return new URL(String(url), 'http://localhost').searchParams;
  } catch {
    return null;
  }
}

function parseStored(raw: string): Partial<StoredAttribution> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null
      ? (value as Partial<StoredAttribution>)
      : null;
  } catch {
    return null;
  }
}

function toAttribution(
  raw: Partial<Record<keyof EldraCampaignAttribution, unknown>>
): EldraCampaignAttribution | null {
  const campaignId = tag(raw.campaignId);
  const attribution: EldraCampaignAttribution = {
    campaignId:
      campaignId !== undefined && UUID.test(campaignId) ? campaignId.toLowerCase() : undefined,
    utmSource: tag(raw.utmSource),
    utmMedium: tag(raw.utmMedium),
    utmCampaign: tag(raw.utmCampaign),
  };
  const present = Object.entries(attribution).filter(([, value]) => value !== undefined);
  return present.length === 0 ? null : (Object.fromEntries(present) as EldraCampaignAttribution);
}

function tag(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\p{Cc}/gu, '').trim();
  if (cleaned === '' || cleaned.includes('@')) return undefined;
  // Cut in code points, as the gateway cuts in runes.
  return Array.from(cleaned).slice(0, MAX_TAG_LENGTH).join('').trim();
}
