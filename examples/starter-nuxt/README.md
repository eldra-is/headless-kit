# Eldra Nuxt starter

Create and run a theme locally:

```sh
eldra-theme init my-site
cd my-site
pnpm install
ELDRA_GATEWAY_URL=https://web-gateway.example.com ELDRA_ORG_ID=<org-id> pnpm dev
```

Each `blocks/<apiId>/` directory contains a complete `block.json`, its Vue renderer in `Block.vue`, and `mock.json` defaults used by Studio. Add a block with `pnpm exec eldra-theme scaffold block <api-id>`, validate with `pnpm validate`, and refresh generated CMS types with `pnpm exec eldra-theme types`.

Edit `tokens.json` to restyle the theme through the generated `--eldra-*` CSS variables. Theme code can use those variables without introducing a second content model.

## Block slots

Blocks may declare bounded semantic insertion regions in `block.json` with a `slots` array, e.g. the hero's action area:

```json
"slots": [
  { "id": "actions", "label": "Action buttons", "description": "Buttons rendered under the hero copy. Falls back to the built-in CTA.", "maxItems": 2, "allowedBlockApiIds": ["cta"] }
]
```

Each slot declares a unique lowercase-kebab `id` (used as the named slot in `Block.vue`), a `label` shown in Studio, an optional `description`, a required `maxItems` capacity between 1 and 20, and an optional `allowedBlockApiIds` allowlist of block `apiId`s that may be placed in the slot. An omitted allowlist admits any block type except the host block itself; every allowlisted id must exist in the theme or `pnpm validate` rejects the catalog.

Render the slot with an ordinary named slot plus fallback content:

```vue
<div class="actions">
  <slot name="actions">
    <a v-if="d.ctaLabel && ctaHref" class="button" :href="ctaHref">{{ d.ctaLabel }}</a>
  </slot>
</div>
```

This is the fallback convention: block authors write plain `<slot name="…">` fallback content, and an empty slot renders identically in Studio preview and static output — there is no hidden persistence or executable CMS data. Layout documents may place at most `maxItems` blocks per slot; validation fails closed (`SLOT_FULL`) on overflow, and the allowlist is enforced per placement. In Studio preview, rendered slots additionally carry editor-only markers (an `aria-hidden` `data-eldra-slot-marker` element with `data-eldra-slot-id` reporting `label · n/maxItems`) and their geometry is reported over the `theme:slots-rendered` bridge message; static generation includes neither.

## Build and deploy

```sh
pnpm generate
ELDRA_API_URL=https://api.studio.example.com \
ELDRA_DEPLOY_TOKEN=<site-token> pnpm exec eldra-theme deploy
```

The deploy command uploads the generated static site and exact `.eldra/manifest.json`. Eldra ingests that manifest to create or update CMS schemas tagged `block`; Git is version control only and is never the schema-sync channel. Keep the site-scoped deploy token in your CI secret store.

`/404` is a reserved path in this starter: it always renders the not-found shell (prerendered to the static `404.html` hosts serve for unmatched routes), so a CMS page authored with the slug `404` will be shadowed.

For a real local-stack deployment through the Cloudflare dev Worker and Pages,
including tunnel callbacks, artifact checks, browser verification, and
troubleshooting, see [the local theme deployment runbook](../../docs/theme-local-deployment.md).

## Wiring rebuilds

The starter includes GitHub Actions, GitLab CI, and Bitbucket Pipelines examples. All build locally with Node 20 and pnpm, run `nuxi generate`, then push the static output with `eldra-theme deploy`.

- GitHub: set repository variables `ELDRA_GATEWAY_URL`, `ELDRA_ORG_ID`, and `ELDRA_API_URL`, plus secret `ELDRA_DEPLOY_TOKEN`. In Studio choose the GitHub trigger and configure `https://api.github.com/repos/<owner>/<repo>/dispatches` with a token allowed to dispatch workflows.
- GitLab: configure those four names as project CI/CD variables, masking `ELDRA_DEPLOY_TOKEN`. In Studio use the project pipeline-trigger URL, trigger token, and branch/tag ref.
- Bitbucket: configure repository variables, securing `ELDRA_DEPLOY_TOKEN`. In Studio use the pipelines endpoint, `username:app-password` token, and ref; the backend selects the `eldra-rebuild` custom pipeline.

Trigger tokens and app passwords are write-only in Studio. Rebuild requests supply `ELDRA_TRIGGER_DEPLOYMENT_ID`; the deploy command returns it as multipart `triggerDeploymentId`, completing the existing MANUAL or CONTENT_PUBLISH deployment rather than creating a duplicate.
