import { createEvent, setResponseHeader } from 'h3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { withEventHeaders } from '../src/runtime/server/utils';

function event() {
  const req = new IncomingMessage(new Socket());
  return createEvent(req, new ServerResponse(req));
}

describe('withEventHeaders', () => {
  it('leaves out what earlier middleware set, so that value is the one sent, once', () => {
    const e = event();
    setResponseHeader(e, 'cache-control', 'private, no-cache');
    setResponseHeader(e, 'set-cookie', 'a=1');
    const built = new Response('page', {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=0',
        'content-type': 'text/html',
        'set-cookie': 'b=2',
      },
    });
    const out = withEventHeaders(e, built);
    expect(out.headers.get('cache-control')).toBeNull();
    expect(out.headers.get('set-cookie')).toBeNull();
    expect(out.headers.get('content-type')).toBe('text/html');
    expect(out.status).toBe(200);
  });
});
