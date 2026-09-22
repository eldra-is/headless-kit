# Local theme deployment runbook

Use this runbook when testing a real theme against a local Eldra stack. It
uses the actual public CMS gateway, Studio deployment API, Cloudflare deploy
Worker, and Pages Direct Upload path. It does not use mocked CMS responses.

Keep credentials out of shell history, source control, terminal output, and
screenshots. In particular, do not read or copy protected environment files
into commands or documentation.

## What each URL is for

These two endpoints serve different purposes:

| Purpose                               | Local endpoint                      |
| ------------------------------------- | ----------------------------------- |
| Theme runtime CMS reads               | `https://<web-gateway-host>/api`    |
| Studio control plane and theme upload | `https://<studio-gateway-host>/api` |

The theme must use the first endpoint as `ELDRA_GATEWAY_URL`. Using the Studio
gateway as the runtime CMS URL produces a deployed application that cannot
load pages.

## 1. Build a real artifact

Work from a disposable copy of the starter so generated output and local
Wrangler state never pollute the template:

```sh
cd /path/to/headless-kit
cp -R examples/starter-nuxt /private/tmp/eldra-theme-check
cd /private/tmp/eldra-theme-check

export ELDRA_DEV_CA_CERT=/path/to/web-studio-core/dev/dev-ca/rootCA.pem
export NODE_EXTRA_CA_CERTS="$ELDRA_DEV_CA_CERT"
export ELDRA_GATEWAY_URL='https://<web-gateway-host>/api'
export ELDRA_ORG_ID='<real organization UUID>'
export ELDRA_LOCALE='en'
export ELDRA_STUDIO_ORIGIN='https://<studio-origin>'

pnpm generate
```

Do not disable TLS verification. Trust the local development CA explicitly
with `NODE_EXTRA_CA_CERTS` instead.

Check the generated artifact before it leaves the machine:

```sh
test -f .output/public/index.html
test -f .output/public/200.html
test -f .output/public/.eldra/manifest.json
rg "frame-ancestors 'self' https://<studio-origin>" .output/public/_headers
if rg -n 'ELDRA_DEPLOY_TOKEN|deployToken' .output/public; then
  echo 'deploy token leaked into static output' >&2
  exit 1
fi
```

`index.html` and `200.html` should embed the real web gateway and organization
ID. `_headers` must permit only the exact Studio parent origin; do not broaden
it to a wildcard. Use the full organization Studio origin—for example,
`https://<studio-origin>`—because the browser's
`event.origin` includes the organization subdomain. Use `https://localhost:4311`
only when Studio is actually running there with that origin supported by the
authentication stack.

## 2. See the generated theme locally

Serving the static artifact with Wrangler/Miniflare tests the same generated
files that will be uploaded. It does **not** replace the real Cloudflare
deployment worker.

```sh
pnpm dlx wrangler@3 pages dev .output/public --ip 127.0.0.1 --port 8788
```

Open `http://127.0.0.1:8788/` in a browser and confirm that real page content
renders. A useful smoke check is that the page contains known CMS content and
contains neither `Page not found` nor `Invalid URL`.

## 3. Make the callback reachable before deploying

The deployed Cloudflare Worker must call the local site-service callback after
it begins and completes a Pages upload. A quick tunnel is appropriate for
local development only and must stay alive for the whole deployment:

```sh
cloudflared tunnel --url http://127.0.0.1:4500
```

Copy the generated `https://<random>.trycloudflare.com` hostname and verify it
before use:

```sh
curl -fsS https://<random>.trycloudflare.com/health/ready
```

Configure the **deployed dev Worker** variable to exactly:

```text
SITE_SERVICE_CALLBACK_URL=https://<random>.trycloudflare.com/api/sites/public/v1/deployments/callback
```

The default `localhost` callback URL in Worker configuration is for local
Worker development only. A Worker running at Cloudflare cannot reach it. Keep
the configured Worker name, queue, R2 binding, Durable Object migration, and
existing secrets intact when changing this variable.

## 4. Upload the artifact

Use a current site-scoped deploy token from Studio. The API base needs the
`/api` suffix:

```sh
export ELDRA_API_URL='https://<studio-gateway-host>/api'
export ELDRA_DEPLOY_TOKEN='<current site deploy token>'
export ELDRA_DEPLOY_POLL_INTERVAL_MS=2000

pnpm exec eldra-theme deploy --dir .output/public
```

The CLI sends multipart fields in this fixed order: manifest, optional commit
SHA, optional trigger deployment ID, then the final artifact. Do not add a
trigger ID for an ordinary manual replacement deployment.

Success has all three transitions:

```text
status: QUEUED
status: PROCESSING
status: SUCCESS
deployed: https://<deployment>.eldra-<site>.pages.dev
```

The returned `deployed:` URL is the URL to test. Do not keep checking an older
deployment-prefixed Pages URL; it can legitimately continue serving a prior
broken artifact.

## 5. Observe and verify the real Worker path

Use an authenticated Cloudflare operator session to tail the deployed dev
Worker while submitting the artifact:

```sh
pnpm dlx wrangler@3 tail <dev-worker-name> --format json
```

Expected progression is a signed `POST /v1/jobs` with `202`, a Durable Object
enqueue with `202`, a queue consumer batch, callback processing, and a Pages
deployment. Then verify the returned Pages URL without cache:

```sh
if curl -ksS -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
  https://<deployment>.eldra-<site>.pages.dev/ | rg 'Page not found|Invalid URL'; then
  echo 'preview returned a failure page' >&2
  exit 1
fi
```

Also open that exact URL in a real browser. Successful HTTP alone is not
enough: confirm a recognizable CMS block renders.

## Troubleshooting map

| Symptom                                                                                             | Meaning and next check                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot POST /sites/v1/public/deploys`                                                              | `ELDRA_API_URL` is missing `/api`.                                                                                                                                                 |
| Local build cannot fetch CMS because of a certificate error                                         | Set `NODE_EXTRA_CA_CERTS` to the local development CA; do not turn off TLS verification.                                                                                           |
| Deployment stays `QUEUED`                                                                           | Check the signed Worker enqueue and queue consumer in a Worker tail.                                                                                                               |
| Worker tail shows `POST /v1/jobs → 202` and Durable Object `→ 202`, followed by `DEPENDENCY_FAILED` | The theme upload reached the Worker. Check the live callback tunnel/Worker callback variable first, then R2 and Pages credentials/bindings. This is not a theme rendering failure. |
| Message reaches the DLQ                                                                             | It will not replay automatically. Correct the dependency, then submit a fresh deployment.                                                                                          |
| A new preview works but an old Pages URL says `Invalid URL`                                         | The old URL is a previous deployment artifact. Test and share the callback's newly returned preview URL.                                                                           |
| Site page says `Page not found`                                                                     | Inspect the deployed artifact's runtime gateway/org configuration and the actual CMS page lookup; Pages routing is not automatically at fault.                                     |

## Clean up

Stop the quick tunnel after the terminal callback and remove the disposable
copy. Do not delete source templates or use a broad recursive delete target.
