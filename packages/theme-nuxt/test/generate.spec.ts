import { execa } from 'execa';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockGateway, TEMPLATE_HEADER_NODE_ID } from './mockGateway';

const fixtureDir = fileURLToPath(new URL('./fixtures/basic', import.meta.url));
const nuxi = fileURLToPath(new URL('../node_modules/.bin/nuxi', import.meta.url));
const moduleVersion = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
let gateway: Awaited<ReturnType<typeof startMockGateway>>;

describe('theme-nuxt nuxi generate', () => {
  beforeAll(async () => {
    gateway = await startMockGateway();
    rmSync(join(fixtureDir, '.nuxt'), { recursive: true, force: true });
    rmSync(join(fixtureDir, '.output'), { recursive: true, force: true });
    await execa(nuxi, ['generate'], {
      cwd: fixtureDir,
      env: {
        ELDRA_GATEWAY_URL: gateway.url,
        ELDRA_ORG_ID: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      timeout: 300_000,
    });
  }, 360_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      gateway.server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  const output = (path: string) => join(fixtureDir, '.output', 'public', path);

  it('prerenders home and about routes discovered through pagination contract', () => {
    expect(existsSync(output('index.html'))).toBe(true);
    expect(existsSync(output('about/index.html'))).toBe(true);
    expect(existsSync(output('slotted/index.html'))).toBe(true);
    expect(existsSync(output('control/index.html'))).toBe(true);
    expect(existsSync(output('bad/index.html'))).toBe(true);
    expect(existsSync(output('articles/hello-dynamic/index.html'))).toBe(true);
    expect(existsSync(output('articles/code-owned/index.html'))).toBe(true);
    expect(gateway.requests.some((request) => request.includes('pageSize=100'))).toBe(true);
  });

  it('prerenders and renders a catalog-backed route template from the public catalog', () => {
    expect(existsSync(output('products/merino-crew/index.html'))).toBe(true);
    // Only active products get a route: the archived one the list endpoint
    // would serve unfiltered must not have been generated.
    expect(existsSync(output('products/retired-tee/index.html'))).toBe(false);

    const product = readFileSync(output('products/merino-crew/index.html'), 'utf8');
    expect(product).toContain('Product: Merino crew');
    expect(product).toContain('data-eldra-template-block="product-hero"');

    // The catalog read replaces the CMS entry read entirely: the product came
    // from the public catalog endpoint, and no CMS schema was consulted for it.
    expect(gateway.requests).toContain('/catalog/v1/products/merino-crew?locale=is');
    expect(
      gateway.requests.some((request) => request.startsWith('/catalog/v1/products/list?'))
    ).toBe(true);
    expect(gateway.requests.some((request) => request.includes('/schema/catalog%3Aproduct/'))).toBe(
      false
    );
  });

  it('renders dynamic templates and preserves native code-route precedence', () => {
    const dynamic = readFileSync(output('articles/hello-dynamic/index.html'), 'utf8');
    expect(dynamic).toContain('Article: Dynamic article heading');
    expect(dynamic).toContain('Static dynamic-page subheading');
    expect(dynamic).toContain('data-eldra-template-block="article-hero"');
    expect(dynamic).toContain('data-eldra-block="77777777-7777-4777-8777-777777777777"');
    expect(dynamic).toContain('data-eldra-schema="hero"');

    const codeOwned = readFileSync(output('articles/code-owned/index.html'), 'utf8');
    expect(codeOwned).toContain('Code-owned route wins');
    expect(codeOwned).not.toContain('CMS content must not render');
    expect(gateway.requests).not.toContain(
      '/cms/v1/schema/article/entry/unique/slug/code-owned?locale=is&depth=3'
    );
  });

  it('renders a route template whose reusable placement arrived pre-expanded, leaking nothing', () => {
    // The public route-template read is expanded and redacted the way a public
    // page read is: the placement is gone, the component's container and block
    // are ordinary layout nodes, and no component/site identity exists to leak.
    // So the header must render beside the template's own block, and the
    // prerendered payload must carry no projection — the assertion the static
    // pages above already make, now on a template route as well.
    const dynamic = readFileSync(output('articles/hello-dynamic/index.html'), 'utf8');
    expect(dynamic).toContain('Shared template header');
    expect(dynamic).toContain('data-eldra-layout-node="article-shared-header"');
    expect(dynamic).toContain(`data-eldra-layout-node="${TEMPLATE_HEADER_NODE_ID}"`);
    expect(dynamic).toContain('data-eldra-block="99999999-9999-4999-8999-999999999999"');
    // Public output carries no placement identity, exactly as a public page.
    expect(dynamic).not.toContain('data-eldra-reusable-placement');
    expect(dynamic).not.toContain('data-eldra-invalid-layout');
    // …and the template's own bound block still renders beside it.
    expect(dynamic).toContain('Article: Dynamic article heading');

    const payload = readFileSync(output('articles/hello-dynamic/_payload.json'), 'utf8');
    expect(payload).not.toContain('reusableComponentProjection');
    expect(payload).not.toContain('componentId');
  });

  it('generates declared slot content with fallback, no markers, and fail-closed invalid layouts', () => {
    const slotted = readFileSync(output('slotted/index.html'), 'utf8');
    const control = readFileSync(output('control/index.html'), 'utf8');
    const bad = readFileSync(output('bad/index.html'), 'utf8');
    const staticPages = [
      readFileSync(output('index.html'), 'utf8'),
      readFileSync(output('about/index.html'), 'utf8'),
      slotted,
      control,
      bad,
      readFileSync(output('200.html'), 'utf8'),
      readFileSync(output('404.html'), 'utf8'),
    ].join('');

    // 1. Exact DOM parity with the theme-vue slot tests: the cta child block
    // renders inside the [data-eldra-slot-id="actions"] wrapper. The wrapper
    // carries the child entry id; the nested block wrapper carries the child
    // schema annotation.
    expect(slotted).toContain('data-eldra-layout-node="slotted-hero"');
    expect(slotted).toContain('data-eldra-block="55555555-5555-4555-8555-555555555555"');
    expect(slotted).toContain('data-eldra-layout-node="slotted-cta"');
    expect(slotted).toMatch(
      /data-eldra-slot-id="actions"[^>]*data-eldra-block="66666666-6666-4666-8666-666666666666"[^>]*>[\s\S]*?data-eldra-schema="cta"/
    );
    expect(slotted).toContain('Shop now');
    expect(slotted).not.toContain('data-eldra-slot-fallback');

    // 2. The empty-slot control page renders the block's fallback markup, with
    // no slot wrapper at all.
    expect(control).toContain('data-eldra-slot-fallback');
    expect(control).toContain('Default action');
    expect(control).not.toContain('data-eldra-slot-id');

    // 3. Slot markers are editor-only: none may appear anywhere in static output.
    expect(staticPages).not.toContain('data-eldra-slot-marker');

    // 4. The slot-descendant entry reached the renderer through the depth
    // pipeline: the gateway records every entry id it serves, and the cta
    // child must be among them. Block entries are inlined in the page document
    // by design (there is no per-block HTTP fetch), so the served-entry record
    // is the gateway-side proof; the layout-driven projection that keeps the
    // child is covered by the runtime draft-overlay tests.
    expect([...gateway.servedEntryIds]).toContain('66666666-6666-4666-8666-666666666666');

    // 5. A slot id the fixture manifest does not declare fails closed: the
    // invalid-layout div replaces the whole tree, with no partial slot content.
    expect(bad).toContain('data-eldra-invalid-layout');
    expect(bad).not.toContain('data-eldra-slot-id');
    expect(bad).not.toContain('Shop now');
  });

  it('keeps a breakpoint-hidden node in the artifact, hidden by CSS and unmarked', () => {
    const html = readFileSync(output('index.html'), 'utf8');
    // `visible: { normal: true, tablet: false, mobile: true }`: tablet only.
    expect(html).toContain('data-eldra-hidden="tablet"');
    const cls = `eldra-layout-${createHash('sha256').update('secondary-hero').digest('hex')}`;
    expect(html).toContain(`.${cls}:not([data-eldra-editing]){display:none;}`);
    expect(html).toContain(`.${cls}[data-eldra-editing]{opacity:0.35;}`);
    // The gate is shut on a published artifact: nothing carries the marker the
    // overlay sets in edit mode, so the node is hidden exactly as before.
    expect(html).not.toContain('data-eldra-editing=');
  });

  it('renders resolved blocks through the shared responsive layout renderer', () => {
    const html = readFileSync(output('index.html'), 'utf8');
    const about = readFileSync(output('about/index.html'), 'utf8');
    expect(html).toContain('Generated heading');
    expect(html).toContain('Nested heading');
    expect(html).toContain('data-eldra-block="11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('data-eldra-block="22222222-2222-4222-8222-222222222222"');
    expect(html).toContain('data-eldra-schema="hero"');
    expect(html).toContain('data-eldra-layout-node="page-grid"');
    expect(html).toContain('data-eldra-layout-node="primary-hero"');
    expect(html).toContain('data-eldra-layout-node="nested-flex"');
    expect(html).toContain('data-eldra-layout-node="secondary-hero"');
    const homeFooterId = `r${createHash('sha256').update('shared-footer\0footer-content').digest('hex')}`;
    const aboutFooterId = `r${createHash('sha256').update('shared-footer-about\0footer-content').digest('hex')}`;
    expect(html).toContain('data-eldra-layout-node="shared-footer"');
    expect(html).toContain(`data-eldra-layout-node="${homeFooterId}"`);
    expect(html).toContain('Sameiginlegur fótur');
    expect(html).not.toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(about).toContain('Sameiginlegur fótur');
    expect(about).toContain(`data-eldra-layout-node="${aboutFooterId}"`);
    expect(about).toContain('data-eldra-layout-node="shared-footer-about"');
    expect(about).not.toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(`${html}${about}`).not.toContain('data-eldra-reusable-placement');

    const payloads = [
      readFileSync(output('_payload.json'), 'utf8'),
      readFileSync(output('about/_payload.json'), 'utf8'),
    ].join('');
    expect(payloads).not.toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(payloads).not.toContain('reusableComponentProjection');
    expect(payloads).not.toContain('componentId');
    expect(`${html}${about}${payloads}`).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('emits deterministic scoped CSS for the three fixed viewport ranges', () => {
    const html = readFileSync(output('index.html'), 'utf8');
    const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(
      (match) => match[1] ?? ''
    );
    const css = styles.find((style) => style.includes('.eldra-layout-')) ?? '';
    const pageGridClass = `eldra-layout-${createHash('sha256').update('page-grid').digest('hex')}`;
    expect(html).toContain(`class="${pageGridClass}"`);
    expect(css).toContain(`.${pageGridClass}{`);
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*767px\)/);
    expect(css.match(/@media/g)).toHaveLength(3);
    const tabletStart = css.indexOf('@media (min-width:768px) and (max-width:1023px)');
    const mobileStart = css.indexOf('@media (max-width:767px)');
    const normalCss = css.slice(0, tabletStart);
    const tabletCss = css.slice(tabletStart, mobileStart);
    const mobileCss = css.slice(mobileStart);
    expect(normalCss).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(normalCss).toMatch(/flex-direction:\s*row/);
    expect(tabletCss).toMatch(/flex-direction:\s*row/);
    expect(tabletCss).toMatch(/display:\s*none/);
    expect(mobileCss).toMatch(/grid-template-columns:\s*repeat\(1,\s*minmax\(0,\s*1fr\)\)/);
    expect(mobileCss).toMatch(/flex-direction:\s*column/);
    expect(mobileCss).toMatch(/display:\s*block/);
    expect(normalCss).toContain('max-width:var(--eldra-container-content-max-width)');
    expect(mobileCss).toContain('max-width:var(--eldra-container-full-max-width)');
    expect(css).not.toMatch(/(?:url\(|calc\(|position:\s*(?:absolute|fixed|sticky)|<script)/i);
    expect(html).toMatch(/<style[^>]*nonce="fixture-layout-nonce"[^>]*>/);
  });

  it('writes CSP headers, version metadata, manifest, and SPA fallback', () => {
    const headers = readFileSync(output('_headers'), 'utf8');
    expect(headers).toContain("frame-ancestors 'self' https://acme.eldracms.com");
    expect(headers).not.toContain('https://*.eldracms.com');
    const html = readFileSync(output('index.html'), 'utf8');
    expect(html).toContain('name="eldra-theme-version" content="1.2.3"');
    expect(html).toContain(`name="eldra-sdk-version" content="${moduleVersion}"`);
    expect(html).toContain('--eldra-color-primary:#4f46e5;');
    expect(html).toContain('--eldra-container-content-max-width:64rem;');
    expect(html).toContain(
      'studioOrigins:["https://acme.eldracms.com","https://*.studio.example.test:3000"]'
    );
    expect(existsSync(output('.eldra/manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(output('.eldra/manifest.json'), 'utf8')) as {
      customPages?: unknown;
    };
    expect(manifest.customPages).toEqual([
      {
        path: '/articles/code-owned',
        title: 'Code-owned article',
        description: 'A native Nuxt route that wins over the CMS template.',
      },
    ]);
    expect(existsSync(output('200.html'))).toBe(true);
  });

  it('ships no editor runtime: no TipTap, ProseMirror or UI-library code in the output', () => {
    // §18 v2: the theme SDK is a bridge — it renders rich text but hosts no
    // editor. Nothing in a generated theme may reference the editor stack,
    // neither inline in the HTML nor as a chunk name under _nuxt.
    const html = readFileSync(output('index.html'), 'utf8');
    expect(html).not.toMatch(/tiptap|prosemirror|vue-ui-components/i);

    const chunks = readdirSync(join(fixtureDir, '.output', 'public', '_nuxt'));
    for (const chunk of chunks) {
      expect(chunk, chunk).not.toMatch(/tiptap|prosemirror|vue-ui-components|editor/i);
    }
  });

  it('keeps static pages renderable while an upgraded site awaits its route-template schema', async () => {
    const upgradeGateway = await startMockGateway({ missingRouteTemplateSchema: true });
    try {
      rmSync(join(fixtureDir, '.nuxt'), { recursive: true, force: true });
      rmSync(join(fixtureDir, '.output'), { recursive: true, force: true });
      await execa(nuxi, ['generate'], {
        cwd: fixtureDir,
        env: {
          ELDRA_GATEWAY_URL: upgradeGateway.url,
          ELDRA_ORG_ID: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        },
        timeout: 300_000,
      });

      expect(readFileSync(output('index.html'), 'utf8')).toContain('Generated heading');
      expect(readFileSync(output('index.html'), 'utf8')).not.toContain('Page not found');
    } finally {
      await new Promise<void>((resolve, reject) =>
        upgradeGateway.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }, 360_000);
});
