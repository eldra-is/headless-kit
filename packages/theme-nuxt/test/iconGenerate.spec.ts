import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { BRAND_SVG } from "./mockGateway";
import {
  generateSiteIcons,
  inspectIconSource,
  loadIconSource,
  MAX_SOURCE_BYTES,
  prepareSiteIcons,
  SITE_ICONS_SKIPPED,
  type GeneratedSiteIcons,
  type IconSource,
} from "../src/runtime/iconGenerate";
import type { ResolvedSiteIcons } from "../src/runtime/siteIcons";

const RESOLVED: ResolvedSiteIcons = {
  iconUrl: "https://cdn.example.test/brand.svg",
  backgroundColor: "#112233",
  themeColor: "#ff6600",
  shortName: "Acme",
  name: "Acme Store",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const svgSource = async (): Promise<IconSource> => {
  const inspected = await inspectIconSource(Buffer.from(BRAND_SVG), "svg");
  if (!("source" in inspected)) throw new Error(inspected.error);
  return inspected.source;
};

const pngSource = async (side = 512): Promise<IconSource> => {
  const data = await sharp(Buffer.from(BRAND_SVG), {
    density: (72 * side) / 512,
  })
    .resize(side, side)
    .png()
    .toBuffer();
  const inspected = await inspectIconSource(data, "png");
  if (!("source" in inspected)) throw new Error(inspected.error);
  return inspected.source;
};

const file = (icons: GeneratedSiteIcons, name: string): Buffer => {
  const found = icons.files.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`no ${name} generated`);
  return found.data;
};

const pixel = async (
  data: Buffer,
  x: number,
  y: number,
): Promise<{ r: number; g: number; b: number; a: number }> => {
  const { data: raw, info } = await sharp(data)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return { r: raw[at]!, g: raw[at + 1]!, b: raw[at + 2]!, a: raw[at + 3]! };
};

describe("generateSiteIcons from an SVG", () => {
  it("writes every file, with icon.svg only because the source is SVG", async () => {
    const icons = await generateSiteIcons(await svgSource(), RESOLVED);

    expect(icons.files.map((f) => f.name).sort()).toEqual(
      [
        "apple-touch-icon.png",
        "favicon-32.png",
        "favicon.ico",
        "icon-192.png",
        "icon-512-maskable.png",
        "icon-512.png",
        "icon.svg",
        "site.webmanifest",
      ].sort(),
    );
    expect(file(icons, "icon.svg").toString()).toBe(BRAND_SVG);
  });

  it("writes PNGs at the documented sizes", async () => {
    const icons = await generateSiteIcons(await svgSource(), RESOLVED);

    for (const [name, side] of [
      ["favicon-32.png", 32],
      ["apple-touch-icon.png", 180],
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["icon-512-maskable.png", 512],
    ] as const) {
      const data = file(icons, name);
      expect(data.subarray(0, 8).equals(PNG_MAGIC), name).toBe(true);
      const meta = await sharp(data).metadata();
      expect([meta.width, meta.height], name).toEqual([side, side]);
    }
  });

  it("writes an ICO holding 16, 32 and 48 px PNG images", async () => {
    const ico = file(
      await generateSiteIcons(await svgSource(), RESOLVED),
      "favicon.ico",
    );

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    const sides: number[] = [];
    for (let index = 0; index < 3; index++) {
      const entry = 6 + index * 16;
      sides.push(ico.readUInt8(entry));
      const size = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const image = ico.subarray(offset, offset + size);
      expect(image.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
      expect((await sharp(image).metadata()).width).toBe(ico.readUInt8(entry));
    }
    expect(sides).toEqual([16, 32, 48]);
  });

  it("flattens the apple icon onto the background colour with no alpha", async () => {
    const apple = file(
      await generateSiteIcons(await svgSource(), RESOLVED),
      "apple-touch-icon.png",
    );

    expect((await sharp(apple).metadata()).hasAlpha).toBe(false);
    // The corner is the source's transparent margin: it must be the background, not black.
    expect(await pixel(apple, 1, 1)).toMatchObject({
      r: 0x11,
      g: 0x22,
      b: 0x33,
      a: 255,
    });
    expect(await pixel(apple, 90, 90)).toMatchObject({
      r: 0xff,
      g: 0x66,
      b: 0x00,
    });
  });

  it("keeps the plain 192/512 icons transparent", async () => {
    const icon = file(
      await generateSiteIcons(await svgSource(), RESOLVED),
      "icon-512.png",
    );

    expect((await pixel(icon, 1, 1)).a).toBe(0);
  });

  it("pads the maskable icon inside the safe zone on the background colour", async () => {
    const maskable = file(
      await generateSiteIcons(await svgSource(), RESOLVED),
      "icon-512-maskable.png",
    );

    expect((await sharp(maskable).metadata()).hasAlpha).toBe(false);
    expect(await pixel(maskable, 1, 1)).toMatchObject({
      r: 0x11,
      g: 0x22,
      b: 0x33,
    });
    expect(await pixel(maskable, 256, 256)).toMatchObject({
      r: 0xff,
      g: 0x66,
      b: 0x00,
    });
    // The source disc spans 200/512 of the side at full size; at 60% it reaches 0.234 of the side
    // from the centre, so 0.3 from the centre is background — the artwork has margin to the mask.
    expect(await pixel(maskable, 256 - 154, 256)).toMatchObject({
      r: 0x11,
      g: 0x22,
      b: 0x33,
    });
  });

  it("writes a manifest naming the generated files, with a maskable purpose on one", async () => {
    const icons = await generateSiteIcons(await svgSource(), RESOLVED);
    const manifest = JSON.parse(file(icons, "site.webmanifest").toString());

    expect(manifest).toEqual({
      name: "Acme Store",
      short_name: "Acme",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      theme_color: "#ff6600",
      background_color: "#112233",
      display: "standalone",
      start_url: "/",
    });
  });

  it("emits tags only for generated files", async () => {
    const icons = await generateSiteIcons(await svgSource(), RESOLVED);
    const names = new Set(icons.files.map((f) => f.name));

    expect(icons.link.map((l) => l.rel)).toEqual([
      "icon",
      "icon",
      "icon",
      "apple-touch-icon",
      "manifest",
    ]);
    for (const link of icons.link)
      expect(names.has(link.href!.slice(1)), link.href).toBe(true);
    expect(icons.meta).toEqual([{ name: "theme-color", content: "#ff6600" }]);
  });

  it("honours a base URL in the tags and the manifest", async () => {
    const icons = await generateSiteIcons(await svgSource(), RESOLVED, "/shop");
    const manifest = JSON.parse(file(icons, "site.webmanifest").toString());

    expect(icons.link.map((l) => l.href)).toContain(
      "/shop/apple-touch-icon.png",
    );
    expect(manifest.icons[0].src).toBe("/shop/icon-192.png");
    expect(manifest.start_url).toBe("/shop/");
  });

  it("omits theme-color and names the manifest cannot know", async () => {
    const icons = await generateSiteIcons(await svgSource(), {
      backgroundColor: "#ffffff",
      themeColor: null,
      shortName: null,
      name: null,
    });
    const manifest = JSON.parse(file(icons, "site.webmanifest").toString());

    expect(icons.meta).toEqual([]);
    expect(manifest).not.toHaveProperty("theme_color");
    expect(manifest).not.toHaveProperty("name");
    expect(manifest).not.toHaveProperty("short_name");
  });
});

describe("generateSiteIcons from a PNG", () => {
  it("writes no icon.svg and no tag for it", async () => {
    const icons = await generateSiteIcons(await pngSource(), RESOLVED);

    expect(icons.files.some((f) => f.name === "icon.svg")).toBe(false);
    expect(icons.link.some((l) => l.type === "image/svg+xml")).toBe(false);
    expect(icons.files).toHaveLength(7);
  });
});

describe("inspectIconSource", () => {
  it("rejects a PNG below 512 px", async () => {
    const small = await sharp(Buffer.from(BRAND_SVG))
      .resize(256, 256)
      .png()
      .toBuffer();

    expect(await inspectIconSource(small, "png")).toEqual({
      error: expect.stringContaining("below the 512px minimum"),
    });
  });

  it("rejects a non-square image", async () => {
    const wide = await sharp(Buffer.from(BRAND_SVG))
      .resize(600, 512)
      .png()
      .toBuffer();

    expect(await inspectIconSource(wide, "png")).toEqual({
      error: expect.stringContaining("not square"),
    });
  });

  it("rejects bytes that are not an image", async () => {
    expect(
      await inspectIconSource(Buffer.from("not a png at all"), "png"),
    ).toEqual({
      error: expect.stringContaining("cannot be read"),
    });
  });

  it("rejects a PNG labelled as SVG", async () => {
    const png = (await pngSource()).data;

    expect(await inspectIconSource(png, "svg")).toEqual({
      error: expect.stringContaining("not really SVG"),
    });
  });
});

const response = (
  body: BodyInit | null,
  type: string | null,
  init: ResponseInit = {},
): Response =>
  new Response(body, {
    ...init,
    headers: {
      ...(type === null ? {} : { "content-type": type }),
      ...init.headers,
    },
  });

describe("loadIconSource", () => {
  it("loads an SVG over https", async () => {
    const fetchImpl = vi.fn(async () =>
      response(BRAND_SVG, "image/svg+xml; charset=utf-8"),
    );

    const loaded = await loadIconSource(
      "https://cdn.example.test/brand.svg",
      fetchImpl as never,
    );

    expect(loaded).toMatchObject({ source: { kind: "svg", size: 512 } });
  });

  it.each([
    [
      "http outside loopback",
      "http://cdn.example.test/brand.svg",
      null,
      "not https",
    ],
    ["a malformed URL", "not a url", null, "not a URL"],
    [
      "a 404",
      "https://cdn.example.test/brand.svg",
      response("", "text/plain", { status: 404 }),
      "404",
    ],
    [
      "an unsupported type",
      "https://cdn.example.test/brand.gif",
      response("GIF89a", "image/gif"),
      "image/gif",
    ],
    [
      "a non-image content type",
      "https://cdn.example.test/brand.svg",
      response(BRAND_SVG, null),
      "not SVG or PNG",
    ],
    [
      "a declared oversize body",
      "https://cdn.example.test/brand.png",
      response("x", "image/png", {
        headers: { "content-length": String(MAX_SOURCE_BYTES + 1) },
      }),
      "10 MB",
    ],
  ])("returns an error for %s", async (_name, url, answer, message) => {
    const fetchImpl = vi.fn(async () => answer);

    const loaded = await loadIconSource(url, fetchImpl as never);

    expect(loaded).toEqual({ error: expect.stringContaining(message) });
  });

  it("refuses a body that outgrows the cap while streaming", async () => {
    const big = new Uint8Array(MAX_SOURCE_BYTES + 1);

    const loaded = await loadIconSource(
      "https://cdn.example.test/brand.png",
      (async () => response(big, "image/png")) as never,
    );

    expect(loaded).toEqual({ error: expect.stringContaining("10 MB") });
  });

  it("returns the error when the fetch throws", async () => {
    const loaded = await loadIconSource(
      "https://cdn.example.test/brand.svg",
      (async () => {
        throw new Error("ECONNRESET");
      }) as never,
    );

    expect(loaded).toEqual({ error: "ECONNRESET" });
  });
});

describe("prepareSiteIcons fallback", () => {
  const png512 = async (): Promise<Buffer> => (await pngSource()).data;

  it.each([
    [
      "a fetch that throws",
      async () => {
        throw new Error("boom");
      },
    ],
    ["a 500", async () => response("", "text/plain", { status: 500 })],
    ["a corrupt image", async () => response("not a png at all", "image/png")],
    [
      "a non-square image",
      async () =>
        response(
          await sharp(Buffer.from(BRAND_SVG)).resize(600, 512).png().toBuffer(),
          "image/png",
        ),
    ],
    ["an unsupported type", async () => response("GIF89a", "image/gif")],
  ])(
    "answers null with one warning and no files or tags for %s",
    async (_name, fetchImpl) => {
      const warn = vi.fn();

      await expect(
        prepareSiteIcons(RESOLVED, { fetch: fetchImpl as never, warn }),
      ).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain(SITE_ICONS_SKIPPED);
    },
  );

  it("generates when the source is good", async () => {
    const data = await png512();
    const warn = vi.fn();

    const icons = await prepareSiteIcons(RESOLVED, {
      fetch: (async () => response(data, "image/png")) as never,
      warn,
    });

    expect(icons?.files).toHaveLength(7);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("redirects", () => {
  it("refuses a redirect instead of following it to another origin", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://evil.test/i.png" },
        }),
    );
    const loaded = await loadIconSource(
      "https://cdn.example.test/brand.png",
      fetchImpl as never,
    );
    expect(loaded).toEqual({ error: expect.stringContaining("redirects") });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});
