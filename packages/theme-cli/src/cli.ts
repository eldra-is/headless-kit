#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { resolve } from 'node:path';
import { DeployError, deployTheme } from './commands/deploy';
import { initTheme } from './commands/init';
import { scaffoldBlock } from './commands/scaffold';
import { generateBlockTypesFile, generateTypes } from './commands/types';
import { validateTheme } from './commands/validate';

const gatewayArgs = {
  'gateway-url': {
    type: 'string' as const,
    description: 'web-gateway origin (env ELDRA_GATEWAY_URL)',
  },
  'org-id': { type: 'string' as const, description: 'organization id (env ELDRA_ORG_ID)' },
};

function gatewayOptions(args: Record<string, unknown>): { gatewayUrl?: string; orgId?: string } {
  return {
    gatewayUrl: (args['gateway-url'] as string | undefined) ?? process.env.ELDRA_GATEWAY_URL,
    orgId: (args['org-id'] as string | undefined) ?? process.env.ELDRA_ORG_ID,
  };
}

function reportError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

const main = defineCommand({
  meta: { name: 'eldra-theme', description: 'Eldra theme CLI' },
  subCommands: {
    init: defineCommand({
      meta: { description: 'Scaffold a new theme from the starter template' },
      args: { dir: { type: 'positional', default: '.', description: 'target directory' } },
      run({ args }) {
        try {
          initTheme(resolve(String(args.dir)));
          console.log(`Theme created in ${String(args.dir)}. Next: pnpm install && pnpm dev`);
        } catch (error) {
          reportError(error);
        }
      },
    }),
    scaffold: defineCommand({
      meta: { description: 'Scaffold theme artifacts' },
      subCommands: {
        block: defineCommand({
          meta: { description: 'Create blocks/<apiId>/{block.json,Block.vue,mock.json}' },
          args: {
            apiId: { type: 'positional', required: true },
            name: { type: 'string' },
            category: { type: 'string' },
          },
          run({ args }) {
            try {
              const { created } = scaffoldBlock({
                themeDir: process.cwd(),
                apiId: String(args.apiId),
                name: args.name as string | undefined,
                category: args.category as string | undefined,
              });
              for (const file of created) console.log(`created ${file}`);
            } catch (error) {
              reportError(error);
            }
          },
        }),
      },
    }),
    validate: defineCommand({
      meta: { description: 'Validate blocks/ against the block.json schema' },
      args: { remote: { type: 'boolean', default: false }, ...gatewayArgs },
      async run({ args }) {
        try {
          const { errors, warnings, blockCount } = await validateTheme({
            themeDir: process.cwd(),
            remote: Boolean(args.remote),
            ...gatewayOptions(args),
          });
          for (const warning of warnings) console.error(`warning: ${warning}`);
          if (errors.length > 0) {
            for (const error of errors) console.error(error);
            process.exitCode = 1;
            return;
          }
          console.log(`OK — ${blockCount} block${blockCount === 1 ? '' : 's'} valid`);
        } catch (error) {
          reportError(error);
        }
      },
    }),
    types: defineCommand({
      meta: { description: 'Fetch org TypeScript definitions from the gateway' },
      args: {
        out: { type: 'string', default: 'eldra-types.d.ts' },
        schemas: { type: 'string', description: 'comma-separated schema apiIds' },
        blocks: {
          type: 'boolean',
          default: false,
          description: 'Write only .eldra/block-types.d.ts from blocks/*/block.json (no gateway)',
        },
        ...gatewayArgs,
      },
      async run({ args }) {
        if (args.blocks === true) {
          try {
            const target = generateBlockTypesFile({ themeDir: process.cwd() });
            console.log(`wrote ${target}`);
          } catch (error) {
            reportError(error);
          }
          return;
        }
        const { gatewayUrl, orgId } = gatewayOptions(args);
        if (gatewayUrl === undefined || orgId === undefined) {
          reportError(new Error('types: ELDRA_GATEWAY_URL and ELDRA_ORG_ID are required'));
          return;
        }
        try {
          const target = await generateTypes({
            themeDir: process.cwd(),
            gatewayUrl,
            orgId,
            out: String(args.out),
            schemas:
              typeof args.schemas === 'string'
                ? args.schemas
                    .split(',')
                    .map((schema) => schema.trim())
                    .filter(Boolean)
                : undefined,
          });
          console.log(`wrote ${target}`);
        } catch (error) {
          reportError(error);
        }
      },
    }),
    deploy: defineCommand({
      meta: { description: 'Upload the built site and manifest to Eldra' },
      args: {
        dir: { type: 'string', description: 'build output directory' },
        token: { type: 'string', description: 'site deploy token' },
        api: { type: 'string', description: 'Studio API origin' },
        'design-token-mapping': {
          type: 'string',
          description: 'JSON old-to-new token mapping exported by Studio',
        },
        'commit-sha': { type: 'string' },
        'trigger-id': { type: 'string' },
      },
      async run({ args }) {
        const token = (args.token as string | undefined) ?? process.env.ELDRA_DEPLOY_TOKEN;
        const apiUrl = (args.api as string | undefined) ?? process.env.ELDRA_API_URL;
        if (!token) {
          reportError(
            new DeployError('deploy: missing token — pass --token or set ELDRA_DEPLOY_TOKEN')
          );
          return;
        }
        if (!apiUrl) {
          reportError(new DeployError('deploy: missing --api / ELDRA_API_URL'));
          return;
        }
        try {
          const result = await deployTheme({
            token,
            apiUrl,
            dir: args.dir as string | undefined,
            designTokenMapping: args['design-token-mapping'] as string | undefined,
            commitSha: args['commit-sha'] as string | undefined,
            triggerDeploymentId: args['trigger-id'] as string | undefined,
            pollIntervalMs: process.env.ELDRA_DEPLOY_POLL_INTERVAL_MS
              ? Number(process.env.ELDRA_DEPLOY_POLL_INTERVAL_MS)
              : undefined,
          });
          console.log(
            result.previewUrl
              ? `deployed: ${result.previewUrl}`
              : `deployed: ${result.deploymentId}`
          );
        } catch (error) {
          reportError(error);
        }
      },
    }),
  },
});

await runMain(main);
