import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./fixtures/basic/.output/public/', import.meta.url));
const port = Number(process.env.GENERATED_THEME_PORT ?? 4174);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/, '');
  if (relative.startsWith('..')) {
    response.writeHead(400).end('Invalid path');
    return;
  }
  try {
    const body = await readFile(join(root, relative));
    response.writeHead(200, {
      'content-type': contentTypes[extname(relative)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1');
