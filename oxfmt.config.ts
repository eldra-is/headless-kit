import { oxfmtConfig, type OxfmtConfig } from '@nokkvireyr/vue-config/oxc';

export default oxfmtConfig({
  ignorePatterns: [
    '**/CHANGELOG.md',
    '**/RELEASE-NOTES.md',
    'packages/sdk/src/__tests__/fixtures/contract.ts',
    'packages/sdk/src/__tests__/fixtures/web-gateway.json',
    '**/.eldra/manifest.json',
    '**/.eldra/previews.json',
    '**/.eldra/block-types.d.ts',
    'examples/starter-nuxt/stories/generated/**',
  ],
}) as OxfmtConfig;
