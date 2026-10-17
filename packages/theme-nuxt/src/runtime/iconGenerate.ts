import type { Sharp } from "sharp";
import type { ResolvedSiteIcons } from "./siteIcons";

/** One file the build writes into the static output. */
export interface GeneratedIconFile {
  /** Path relative to the site root, e.g. `apple-touch-icon.png`. */
  name: string;
  data: Buffer;
}

export interface GeneratedSiteIcons {
  files: GeneratedIconFile[];
  /** Only tags for files in `files` — a tag never points at a file that was not generated. */
  link: Record<string, string>[];
  meta: Record<string, string>[];
}

export const FETCH_TIMEOUT_MS = 10_000;
/** A larger source is refused: a brand mark is a few hundred KB, never tens of megabytes. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MIN_SOURCE_SIZE = 512;
/**
 * Share of the maskable icon's side the artwork fills. Android masks to a circle of 80% of the
 * side; a square of 60% has half-diagonal 0.42 of the side, so the artwork's own content circle
 * stays inside the safe zone with the usual allowance for rounded artwork.
 */
export const MASKABLE_ARTWORK_SCALE = 0.6;

type SharpFactory = typeof import("sharp");

/**
 * sharp loads a native binary when imported and throws if it is missing (stripped optional
 * dependency, libc/arch mismatch). Importing it lazily keeps that failure inside the icon step,
 * which turns it into the single skipped warning — a build never fails because of icons.
 */
async function loadSharp(): Promise<SharpFactory> {
  const imported = await import("sharp");
  return ((imported as { default?: SharpFactory }).default ??
    imported) as SharpFactory;
}

export const SITE_ICONS_SKIPPED =
  "[eldra] site icons not generated — keeping the theme’s own files";

type SourceKind = "svg" | "png";

export interface IconSource {
  data: Buffer;
  kind: SourceKind;
  /** Natural side in px (viewBox/width for SVG). */
  size: number;
}

/** Why a source was rejected, or the source. Never throws. */
export async function loadIconSource(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ source: IconSource } | { error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "the icon URL is not a URL" };
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && loopback)
  ) {
    return { error: "the icon URL is not https" };
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${FETCH_TIMEOUT_MS}ms`)),
    FETCH_TIMEOUT_MS,
  );
  try {
    // Redirects are not followed: an https URL must not lead to http or another origin.
    const response = await fetchImpl(parsed, {
      signal: controller.signal,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      return {
        error: `the icon redirects (${response.status}); use the final https URL`,
      };
    }
    if (!response.ok) return { error: `the icon answered ${response.status}` };
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase();
    if (type !== "image/png" && type !== "image/svg+xml") {
      return {
        error: `the icon is ${type === "" ? "untyped" : type}, not SVG or PNG`,
      };
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
      return { error: "the icon is larger than 10 MB" };
    }
    const data = await readCapped(response);
    if (data === null) return { error: "the icon is larger than 10 MB" };
    return inspectIconSource(data, type === "image/svg+xml" ? "svg" : "png");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response): Promise<Buffer | null> {
  if (response.body === null) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_SOURCE_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Validates what the bytes really are (sharp metadata), not what the server claimed. */
export async function inspectIconSource(
  data: Buffer,
  kind: SourceKind,
): Promise<{ source: IconSource } | { error: string }> {
  try {
    const sharp = await loadSharp();
    const meta = await sharp(data).metadata();
    if (meta.format !== kind)
      return { error: `the icon is not really ${kind.toUpperCase()}` };
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width === 0 || height === 0) return { error: "the icon has no size" };
    // SVG sizes are rounded by the rasteriser, so allow a pixel of slack on "square".
    if (Math.abs(width - height) > (kind === "svg" ? 1 : 0)) {
      return { error: `the icon is ${width}x${height}, not square` };
    }
    if (kind === "png" && width < MIN_SOURCE_SIZE) {
      return {
        error: `the icon is ${width}px, below the ${MIN_SOURCE_SIZE}px minimum`,
      };
    }
    return { source: { data, kind, size: width } };
  } catch (error) {
    return {
      error: `the icon cannot be read (${error instanceof Error ? error.message : error})`,
    };
  }
}

/**
 * Every icon file and the head tags that reference them, from one source image. Pure and
 * in-memory: the caller decides where the files go. Throws on a rasteriser failure — the caller
 * (`prepareSiteIcons`) turns that into "nothing generated".
 */
export async function generateSiteIcons(
  source: IconSource,
  setting: Pick<
    ResolvedSiteIcons,
    "backgroundColor" | "themeColor" | "shortName" | "name"
  >,
  baseURL = "/",
): Promise<GeneratedSiteIcons> {
  const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const sharp = await loadSharp();
  const render = (side: number): Sharp => {
    // An SVG is rasterised at a density that makes `side` px native, so large sizes stay crisp.
    const density =
      source.kind === "svg"
        ? Math.max(72, Math.ceil((72 * side) / source.size))
        : 72;
    return sharp(source.data, { density }).resize(side, side, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  };
  const png = (side: number): Promise<Buffer> => render(side).png().toBuffer();
  const flattened = (side: number): Promise<Buffer> =>
    render(side)
      .flatten({ background: setting.backgroundColor })
      .removeAlpha()
      .png()
      .toBuffer();
  const maskable = async (side: number): Promise<Buffer> => {
    const inner = Math.round(side * MASKABLE_ARTWORK_SCALE);
    return sharp({
      create: {
        width: side,
        height: side,
        channels: 3,
        background: setting.backgroundColor,
      },
    })
      .composite([{ input: await png(inner), gravity: "centre" }])
      .removeAlpha()
      .png()
      .toBuffer();
  };

  const [p16, p32, p48, apple, p192, p512, p512m] = await Promise.all([
    png(16),
    png(32),
    png(48),
    flattened(180),
    png(192),
    png(512),
    maskable(512),
  ]);

  const files: GeneratedIconFile[] = [
    {
      name: "favicon.ico",
      data: encodeIco([
        { side: 16, data: p16 },
        { side: 32, data: p32 },
        { side: 48, data: p48 },
      ]),
    },
    { name: "favicon-32.png", data: p32 },
    { name: "apple-touch-icon.png", data: apple },
    { name: "icon-192.png", data: p192 },
    { name: "icon-512.png", data: p512 },
    { name: "icon-512-maskable.png", data: p512m },
  ];
  const link: Record<string, string>[] = [
    { rel: "icon", href: `${base}favicon.ico`, sizes: "48x48" },
  ];
  if (source.kind === "svg") {
    files.push({ name: "icon.svg", data: source.data });
    link.push({
      rel: "icon",
      type: "image/svg+xml",
      href: `${base}icon.svg`,
      sizes: "any",
    });
  }
  link.push(
    {
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      href: `${base}favicon-32.png`,
    },
    { rel: "apple-touch-icon", href: `${base}apple-touch-icon.png` },
    { rel: "manifest", href: `${base}site.webmanifest` },
  );
  files.push({
    name: "site.webmanifest",
    data: Buffer.from(manifestJson(setting, base) + "\n"),
  });
  const meta =
    setting.themeColor === null
      ? []
      : [{ name: "theme-color", content: setting.themeColor }];
  return { files, link, meta };
}

function manifestJson(
  setting: Pick<
    ResolvedSiteIcons,
    "backgroundColor" | "themeColor" | "shortName" | "name"
  >,
  base: string,
): string {
  const name = setting.name ?? setting.shortName;
  const manifest: Record<string, unknown> = {
    ...(name === null ? {} : { name }),
    ...(setting.shortName === null ? {} : { short_name: setting.shortName }),
    icons: [
      { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}icon-512.png`, sizes: "512x512", type: "image/png" },
      {
        src: `${base}icon-512-maskable.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    ...(setting.themeColor === null ? {} : { theme_color: setting.themeColor }),
    background_color: setting.backgroundColor,
    display: "standalone",
    start_url: base,
  };
  return JSON.stringify(manifest, null, 2);
}

/** An ICO container holding PNG images (supported by every browser since IE 11). */
export function encodeIco(images: { side: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach((image, index) => {
    const at = index * 16;
    entries.writeUInt8(image.side >= 256 ? 0 : image.side, at);
    entries.writeUInt8(image.side >= 256 ? 0 : image.side, at + 1);
    entries.writeUInt16LE(1, at + 4); // colour planes
    entries.writeUInt16LE(32, at + 6); // bits per pixel
    entries.writeUInt32LE(image.data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, entries, ...images.map((image) => image.data)]);
}

/**
 * The orchestration the module calls: resolved setting in, generated files and tags out — or
 * `null` and **one** warning when anything about the source or the rasteriser is unusable.
 */
export async function prepareSiteIcons(
  resolved: ResolvedSiteIcons,
  options: {
    baseURL?: string;
    fetch?: typeof fetch;
    warn?: (message: string) => void;
  } = {},
): Promise<GeneratedSiteIcons | null> {
  const warn = options.warn ?? console.warn;
  const loaded = await loadIconSource(resolved.iconUrl, options.fetch);
  if ("error" in loaded) {
    warn(`${SITE_ICONS_SKIPPED} (${loaded.error})`);
    return null;
  }
  try {
    return await generateSiteIcons(loaded.source, resolved, options.baseURL);
  } catch (error) {
    warn(
      `${SITE_ICONS_SKIPPED} (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}
