import { createServer, type Server } from 'node:http';

export interface MockDeployApiOptions {
  postStatus?: number;
  errorDetail?: string;
  /** Full POST error response body, overriding the default `{status, detail}` shape. */
  errorBody?: unknown;
  statuses?: string[];
  previewUrl?: string;
  logExcerpt?: string;
  syncResult?: unknown;
}

export interface MockDeployApi {
  server: Server;
  url: string;
  posts: Array<{ auth: string | null; contentType: string | null; body: Buffer }>;
  pollAuth: Array<string | null>;
  getCount: number;
  close(): Promise<void>;
}

export function startMockDeployApi(opts: MockDeployApiOptions = {}): Promise<MockDeployApi> {
  const statuses = opts.statuses ?? ['QUEUED', 'PROCESSING', 'SUCCESS'];

  return new Promise((resolve) => {
    const posts: MockDeployApi['posts'] = [];
    const pollAuth: MockDeployApi['pollAuth'] = [];
    let getCount = 0;
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/sites/v1/public/deploys') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          posts.push({
            auth: req.headers.authorization ?? null,
            contentType: req.headers['content-type'] ?? null,
            body: Buffer.concat(chunks),
          });
          const status = opts.postStatus ?? 202;
          res.statusCode = status;
          if (status !== 202) {
            res.end(
              JSON.stringify(opts.errorBody ?? { status, detail: opts.errorDetail ?? 'SITE_DEPLOY_FAILED' })
            );
            return;
          }
          res.end(
            JSON.stringify({
              deploymentId: 'dep-1',
              syncResult: opts.syncResult ?? {
                created: ['hero'],
                updated: [],
                removed: [],
                warnings: [],
              },
            })
          );
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/sites/v1/public/deploys/dep-1') {
        pollAuth.push(req.headers.authorization ?? null);
        const status = statuses[Math.min(getCount, statuses.length - 1)]!;
        getCount += 1;
        res.end(
          JSON.stringify({
            id: 'dep-1',
            status,
            logExcerpt: opts.logExcerpt ?? null,
            previewUrl: status === 'SUCCESS' ? (opts.previewUrl ?? null) : null,
          })
        );
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null)
        throw new Error('mock deploy API did not bind');
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
        posts,
        pollAuth,
        get getCount() {
          return getCount;
        },
        close: () =>
          new Promise<void>((done, reject) =>
            server.close((error) => (error ? reject(error) : done()))
          ),
      });
    });
  });
}
