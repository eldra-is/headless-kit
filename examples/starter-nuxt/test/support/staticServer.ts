import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

/**
 * The generated site, served the way a static host serves it: an extension-less path is that
 * directory's `index.html`, everything else is the file itself. The same shape
 * `packages/theme-nuxt/test/serveGenerated.mjs` has, as a function a spec can start and stop.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticServer {
  server: Server;
  origin: string;
  close(): Promise<void>;
}

/**
 * Whether a directory-style path is answered with a 308 to the same path plus a trailing slash,
 * the way the deployed preview host answers it:
 *
 * ```
 * $ curl -D - https://<site>/products/ash-glaze-mug
 * HTTP/2 308
 * location: https://<site>/products/ash-glaze-mug/
 * ```
 *
 * `nuxi generate` writes `products/ash-glaze-mug/index.html` and prerenders it under the path
 * **without** the slash, so on the real host every page but `/` is hydrated at a URL one character
 * different from the one it was rendered at. That is not cosmetic — see
 * `prerenderRefresh.browser.spec.ts` — so the harness serves the site the same way rather than the
 * flattering way.
 */
const TRAILING_SLASH_REDIRECT = true;

export function startStaticServer(root: string): Promise<StaticServer> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const relative = normalize(pathname).replace(/^[/\\]+/, '');
      if (relative.startsWith('..')) {
        response.writeHead(400).end('Invalid path');
        return;
      }
      if (
        TRAILING_SLASH_REDIRECT &&
        relative !== '' &&
        extname(relative) === '' &&
        !pathname.endsWith('/')
      ) {
        response.writeHead(308, { location: `${url.pathname}/${url.search}` });
        response.end();
        return;
      }
      const candidate =
        relative === '' || extname(relative) === '' ? join(relative, 'index.html') : relative;
      void readFile(join(root, candidate))
        .then((body) => {
          response.writeHead(200, {
            'content-type': CONTENT_TYPES[extname(candidate)] ?? 'application/octet-stream',
            'cache-control': 'no-store',
          });
          response.end(body);
        })
        .catch(() => {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('Not found');
        });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) return;
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((error) => (error ? fail(error) : done()))
          ),
      });
    });
  });
}
