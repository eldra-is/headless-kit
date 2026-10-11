import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateTheme } from '../commands/validate';

function makeMinimalTheme(root: string): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'tmp-theme', version: '0.0.1' })
  );
  mkdirSync(join(root, 'blocks'), { recursive: true });
}

describe('validateTheme — remote field-type check', () => {
  let root: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'eldra-validate-test-'));
    makeMinimalTheme(root);
    fetchMock = vi.fn();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('strips a long run of trailing slashes off gatewayUrl before building the field-types URL', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ fieldTypes: [{ id: 'string' }, { id: 'markdown' }] })
    );
    const longRun = 'https://gateway.example.test' + '/'.repeat(5000);

    const result = await validateTheme({
      themeDir: root,
      remote: true,
      gatewayUrl: longRun,
      orgId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.warnings).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gateway.example.test/cms/v1/field-types');
  });

  it('behaves the same for a gatewayUrl with a single trailing slash or none at all', async () => {
    fetchMock.mockResolvedValue(Response.json({ fieldTypes: [{ id: 'string' }] }));
    for (const gatewayUrl of ['https://gateway.example.test/', 'https://gateway.example.test']) {
      fetchMock.mockClear();
      await validateTheme({
        themeDir: root,
        remote: true,
        gatewayUrl,
        orgId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        fetch: fetchMock as unknown as typeof fetch,
      });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://gateway.example.test/cms/v1/field-types');
    }
  });
});
