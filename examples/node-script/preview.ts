// Configure the runtime client and build-time generator separately.
// Leaving ELDRA_PREVIEW_TOKEN unset keeps published reads as the default.
import { createEldraClient } from '@eldrajs/sdk';
import { eldra } from '@eldrajs/sdk/vite';

const options = {
  orgId: process.env.ELDRA_ORG_ID,
  previewToken: () => process.env.ELDRA_PREVIEW_TOKEN,
};

export const previewClient = createEldraClient(options);
export const previewPlugin = eldra(options);
