import { createServer, type Server } from 'node:http';

export interface MockGatewayOptions {
  fieldTypes?: string[] | null;
  dts?: string;
}

export interface MockGateway {
  server: Server;
  url: string;
  lastOrgId: string | null;
  lastRequestUrl: string | null;
  close(): Promise<void>;
}

export function startMockGateway(opts: MockGatewayOptions = {}): Promise<MockGateway> {
  return new Promise((resolve) => {
    const api = { lastOrgId: null, lastRequestUrl: null } as unknown as MockGateway;
    const server = createServer((request, response) => {
      api.lastRequestUrl = request.url ?? null;
      api.lastOrgId =
        typeof request.headers['x-org-id'] === 'string' ? request.headers['x-org-id'] : null;
      if (request.url === '/cms/v1/field-types') {
        if (opts.fieldTypes === null) {
          response.statusCode = 404;
          response.end('{}');
          return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            fieldTypes: (opts.fieldTypes ?? ['string', 'text']).map((id) => ({ id })),
          })
        );
        return;
      }
      if (request.url?.startsWith('/cms/v1/typescript-definitions')) {
        response.setHeader('content-type', 'text/plain');
        response.end(opts.dts ?? 'export interface CMSPage {}');
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) return;
      api.server = server;
      api.url = `http://127.0.0.1:${address.port}`;
      api.close = () =>
        new Promise<void>((done, reject) => {
          server.close((error) => (error === undefined ? done() : reject(error)));
        });
      resolve(api);
    });
  });
}
