import { describe, expect, it, vi } from "vitest";

vi.mock("sharp", () => {
  throw new Error(
    'Could not load the "sharp" module using the linux-x64 runtime',
  );
});

describe("prepareSiteIcons without a loadable sharp", () => {
  it("warns once and returns null instead of throwing", async () => {
    const { prepareSiteIcons, SITE_ICONS_SKIPPED } =
      await import("../src/runtime/iconGenerate");
    const warn = vi.fn();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"/></svg>';
    const result = await prepareSiteIcons(
      {
        iconUrl: "https://cdn.example.test/b.svg",
        backgroundColor: "#ffffff",
        themeColor: null,
        shortName: null,
        name: null,
      } as never,
      {
        warn,
        fetch: (async () =>
          new Response(svg, {
            status: 200,
            headers: { "content-type": "image/svg+xml" },
          })) as never,
      },
    );
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain(SITE_ICONS_SKIPPED);
  });
});
