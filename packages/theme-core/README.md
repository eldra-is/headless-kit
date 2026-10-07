# @eldrajs/theme-core

Framework-free core of the Eldra theme SDK: the client that talks to the Studio gateway, stega
encoding/decoding for the visual editor, the overlay runtime that drives in-place editing, layout
CSS, rich-text position mapping, design tokens and image framing. It imports no framework — no
Vue, no Nuxt, no DOM library — so any framework binding (`@eldrajs/theme-vue`, a future React
binding, …) can be built on top of it. The Studio &lt;-&gt; theme postMessage protocol lives at
the `./bridge` subpath, alongside `./stega`, `./overlay`, `./preview-router`, `./layout`,
`./dynamic-route`, `./template-layout`, `./reusable`, `./design-tokens` and `./image-framing`.

```bash
pnpm add @eldrajs/theme-core
```

## Usage

```ts
import { createEldraClient, stripStega } from '@eldrajs/theme-core';

const client = createEldraClient({ gatewayUrl: 'https://api.example.com', orgId: 'org_123' });
const page = await client.getEntry('page', 'home');
const title = stripStega(page.data.title);
```

## Retrying what the gateway refused for now

The gateway rate-limits a client by requests per minute, so a static build of a real site — a
`nuxi generate` is thousands of reads from one address in a few minutes — meets that limit
routinely. A `429` is not an answer, and neither is a `503` while the gateway restarts or a
connection the network drops, so the client asks again: **idempotent requests only**
(`GET`/`HEAD`/`OPTIONS` — a `POST` that timed out may well have been applied), at most five attempts
including the first, honouring `Retry-After` (seconds or HTTP-date, up to a minute) and otherwise
waiting 250 ms doubled per attempt, capped at 5 s, with jitter. Every other status — a `404`, a
`401` — is reported on the first answer, as before, so the preview's own token recovery is
unaffected. A dropped connection is told apart from a **malformed** request — an
unparseable URL, an invalid header name, a `GET` with a body — which fails on the first attempt,
because repeating it can only fail the same way.

```ts
const client = createEldraClient({
  gatewayUrl: 'https://api.example.com',
  orgId: 'org_123',
  retry: { attempts: 5, baseDelayMs: 250, maxDelayMs: 5000 }, // the defaults
});

// One request, no waiting:
createEldraClient({ gatewayUrl: '…', orgId: '…', retry: { attempts: 0 } });
```

A Nuxt theme sets this once, as `eldra.retry` in `nuxt.config.ts` — see
[@eldrajs/theme-nuxt](../theme-nuxt/README.md).

See [docs/themes.md](../../docs/themes.md) for the full theme integration guide.
