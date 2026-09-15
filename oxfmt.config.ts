import { oxfmtConfig, type OxfmtConfig } from '@nokkvireyr/vue-config/oxc';

export default oxfmtConfig({
  ignorePatterns: [
    '**/CHANGELOG.md',
    '**/RELEASE-NOTES.md',
    'packages/sdk/src/contract/v1.ts',
    'packages/sdk/src/contract/web-gateway.v1.json',
  ],
}) as OxfmtConfig;
