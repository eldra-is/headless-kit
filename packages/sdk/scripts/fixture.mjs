#!/usr/bin/env node
// Regenerates src/__tests__/fixtures/contract.ts from src/__tests__/fixtures/web-gateway.json with
// the same generator the Vite plugin uses (built into dist/vite.js, so build first). The fixture is
// a test input, not a shipped file; refresh it when the gateway document changes materially.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContractSource } from '../dist/vite.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = resolve(root, 'src/__tests__/fixtures');
const document = JSON.parse(await readFile(resolve(fixtures, 'web-gateway.json'), 'utf8'));
const source = await createContractSource(document, { sdkImport: '../../index' });
await writeFile(resolve(fixtures, 'contract.ts'), source);
console.log(`fixture contract.ts regenerated for contract ${document.info.version}`);
