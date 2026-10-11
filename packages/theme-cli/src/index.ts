export { deployTheme, detectCommitSha, DeployError } from './commands/deploy';
export type { DeployOptions, DeployResult, DeploySyncResult } from './commands/deploy';
export { fieldMigrationLines } from './deployReport';
export type {
  ConvertedFieldMigration,
  DroppedLinkRows,
  FieldMigrationReport,
  RetiredFieldMigration,
} from './deployReport';
export { initTheme } from './commands/init';
export { scaffoldBlock } from './commands/scaffold';
export type { ScaffoldBlockOptions } from './commands/scaffold';
export { generateBlockTypesFile, generateTypes } from './commands/types';
export { validateTheme } from './commands/validate';
export type { ValidateOptions, ValidateResult } from './commands/validate';
export { scanTheme } from '@eldrajs/vite-plugin-theme/scan';
