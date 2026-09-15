import { oxlintConfig } from '@nokkvireyr/vue-config/oxc';

export default oxlintConfig({
  vue: true,
  ignorePatterns: [
    '**/CHANGELOG.md',
    '**/RELEASE-NOTES.md',
    'packages/sdk/src/__tests__/fixtures/contract.ts',
  ],
  overrides: [
    {
      files: ['scripts/**', 'packages/*/scripts/**', 'examples/**'],
      rules: { 'no-console': 'off' },
    },
  ],
});
