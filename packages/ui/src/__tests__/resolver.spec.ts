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

  it('re-exports componentNames from the resolver entry, so a consumer can reach the list', async () => {
    const entry = await import('../resolver');
    const { componentNames } = await import('../componentNames');
    // The list is only useful to a consumer who can import it; `./resolver` is the entry that
    // answers "which components does this package ship?", so it is where it belongs.
    expect(entry.componentNames).toBe(componentNames);
    expect(entry.componentNames).toContain('Button');
  });

  it('resolves every name in componentNames under the default Eldra prefix', async () => {
    const { componentNames } = await import('../componentNames');
    const resolver = EldraUiResolver();
    for (const name of componentNames) {
      expect(resolver.resolve(`Eldra${name}`)).toEqual({ name, from: '@eldrajs/ui' });
    }
  });

  it('resolves EldraPhoneInput from the phone entry, which the root does not export', async () => {
    expect(EldraUiResolver().resolve('EldraPhoneInput')).toEqual({
      name: 'PhoneInput',
      from: '@eldrajs/ui/phone',
    });
    const entry = await import('../resolver');
    const phone = await import('../phone/index');
    const { componentNames } = await import('../componentNames');
    // Every component the phone entry exports, and none the root already has.
    const exported = Object.keys(phone).filter((key) => /^[A-Z]/.test(key));
    expect([...entry.phoneComponentNames]).toEqual(exported);
    expect(componentNames.filter((name) => exported.includes(name))).toEqual([]);
  });

  it('resolves EldraCountryFlag from the flag entry, which the root does not export', async () => {
    expect(EldraUiResolver().resolve('EldraCountryFlag')).toEqual({
      name: 'CountryFlag',
      from: '@eldrajs/ui/flag',
    });
    const entry = await import('../resolver');
    const flag = await import('../flag/index');
    const { componentNames } = await import('../componentNames');
    const exported = Object.keys(flag).filter((key) => /^[A-Z]/.test(key));
    expect([...entry.flagComponentNames]).toEqual(exported);
    expect(componentNames.filter((name) => exported.includes(name))).toEqual([]);
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
