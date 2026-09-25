import { describe, expect, it } from 'vitest';
import { EldraUiResolver } from '../resolver';

describe('EldraUiResolver', () => {
  it('is a component-type unplugin-vue-components resolver', () => {
    expect(EldraUiResolver().type).toBe('component');
  });

  it('resolves EldraButton to the unprefixed Button export', () => {
    expect(EldraUiResolver().resolve('EldraButton')).toEqual({
      name: 'Button',
      from: '@eldrajs/ui',
    });
  });

  it('resolves every name in componentNames under the default Eldra prefix', async () => {
    const { componentNames } = await import('../componentNames');
    const resolver = EldraUiResolver();
    for (const name of componentNames) {
      expect(resolver.resolve(`Eldra${name}`)).toEqual({ name, from: '@eldrajs/ui' });
    }
  });

  it('resolves under a custom prefix', () => {
    expect(EldraUiResolver({ prefix: 'Acme' }).resolve('AcmeSelect')).toEqual({
      name: 'Select',
      from: '@eldrajs/ui',
    });
  });

  it('returns undefined for a name the package does not export', () => {
    expect(EldraUiResolver().resolve('EldraFrobnicator')).toBeUndefined();
  });

  it('returns undefined for a name outside the prefix entirely', () => {
    expect(EldraUiResolver().resolve('Button')).toBeUndefined();
  });

  it('never implies a Ui prefix: UiButton does not resolve under the default prefix', () => {
    expect(EldraUiResolver().resolve('UiButton')).toBeUndefined();
  });

  it('a custom prefix does not also resolve the default Eldra prefix', () => {
    expect(EldraUiResolver({ prefix: 'Acme' }).resolve('EldraButton')).toBeUndefined();
  });
});
