export { deployTheme, detectCommitSha, DeployError } from './commands/deploy';
export type { DeployOptions, DeployResult, DeploySyncResult } from './commands/deploy';
export { initTheme } from './commands/init';
export { scaffoldBlock } from './commands/scaffold';
export type { ScaffoldBlockOptions } from './commands/scaffold';
export { generateTypes } from './commands/types';
export { validateTheme } from './commands/validate';
export type { ValidateOptions, ValidateResult } from './commands/validate';
export { scanTheme } from '@eldrajs/vite-plugin-theme/scan';
