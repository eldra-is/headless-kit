import { oxlintConfig } from '@nokkvireyr/vue-config/oxc';

export default oxlintConfig({
  vue: true,
  ignorePatterns: ['**/CHANGELOG.md', 'packages/sdk/src/contract/v1.ts'],
  overrides: [
    {
      files: ['scripts/**', 'packages/*/scripts/**', 'examples/**'],
      rules: { 'no-console': 'off' },
    },
  ],
});
