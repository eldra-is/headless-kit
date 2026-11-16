import { describe, expect, it } from 'vitest';
import isIS from '../../messages/is-IS';
import { caretAfter, significantBefore } from '../caret';
import { phoneExample } from '../examples';
import {
  countriesForCallingCode,
  isValidPhone,
  parsePhone,
  phoneCallingCode,
  phoneCountries,
  readPhone,
  typePhone,
} from '../phone';
import { phoneCountryName, phoneRule } from '../rule';

describe('typePhone: one edit of the field', () => {
  it('spaces the digits the way the country writes them', () => {
    expect(typePhone('5812345', 'IS')).toMatchObject({
      text: '581 2345',
      country: 'IS',
      e164: '+3545812345',
      nationalNumber: '5812345',
      stripped: 0,
    });
    expect(typePhone('32123456', 'DK').text).toBe('32 12 34 56');
    expect(typePhone('2015550123', 'US').text).toBe('(201) 555-0123');
  });

  it('gives the dialling code and the digits so far while the number is incomplete', () => {
    expect(typePhone('581', 'IS')).toMatchObject({ text: '581', e164: '+354581' });
  });

  it('is empty for no digits, and drops everything that is not one', () => {
    expect(typePhone('', 'IS')).toMatchObject({ text: '', e164: '', nationalNumber: '' });
    expect(typePhone('abc', 'IS')).toMatchObject({ text: '', e164: '' });
    expect(typePhone('58a1-23 45', 'IS').text).toBe('581 2345');
  });

  it('keeps a national prefix that was typed, and leaves it out of the E.164 value', () => {
    expect(typePhone('07400123456', 'GB')).toMatchObject({
      text: '07400 123456',
      e164: '+447400123456',
    });
  });

  it('picks the country from a number that starts with +, and takes the code out of the text', () => {
    expect(typePhone('+4532123456', 'IS')).toMatchObject({
      text: '32 12 34 56',
      country: 'DK',
      e164: '+4532123456',
      stripped: 3,
    });
  });

  it('switches as soon as the dialling code is complete, not before', () => {
    expect(typePhone('+', 'IS')).toMatchObject({ text: '+', country: 'IS', e164: '' });
    expect(typePhone('+4', 'IS')).toMatchObject({ text: '+4', country: 'IS', stripped: 0 });
    expect(typePhone('+45', 'IS')).toMatchObject({ text: '', country: 'DK', stripped: 3 });
  });

  describe('a dialling code several countries share', () => {
    it('keeps the current country when it is one of them', () => {
      expect(typePhone('+1', 'CA')).toMatchObject({ country: 'CA', text: '' });
      expect(typePhone('+44', 'JE')).toMatchObject({ country: 'JE' });
    });

    it('otherwise takes the country the code belongs to', () => {
      expect(countriesForCallingCode('1')[0]).toBe('US');
      expect(typePhone('+1', 'IS')).toMatchObject({ country: 'US' });
      expect(typePhone('+358', 'IS')).toMatchObject({ country: 'FI' });
    });

    it('follows the digits once they say which country the number is in', () => {
      expect(typePhone('+12045551234', 'IS')).toMatchObject({ country: 'CA' });
      // Typed without the code, on the United States: the area code is Manitoba's.
      expect(typePhone('2045551234', 'US')).toMatchObject({
        country: 'CA',
        text: '(204) 555-1234',
        e164: '+12045551234',
      });
      expect(typePhone('204555', 'US').country).toBe('US');
    });
  });

  describe('limited to some countries', () => {
    const only =
      (...codes: string[]) =>
      (country: string) =>
        codes.includes(country);

    it('does not switch to a country that is not allowed, and leaves its code in the text', () => {
      expect(typePhone('+447400123456', 'IS', only('IS', 'DK'))).toMatchObject({
        text: '+44 7400 123456',
        country: 'IS',
        e164: '+447400123456',
        stripped: 0,
      });
    });

    it('does not follow the digits to a country that is not allowed', () => {
      expect(typePhone('2045551234', 'US', only('US'))).toMatchObject({ country: 'US' });
    });

    it('still switches between the allowed ones', () => {
      expect(typePhone('+4532123456', 'IS', only('IS', 'DK')).country).toBe('DK');
    });
  });
});

describe('readPhone: a value from outside', () => {
  it('spaces a complete number in full, national prefix included', () => {
    expect(readPhone('+447400123456', 'IS')).toMatchObject({
      text: '07400 123456',
      country: 'GB',
      e164: '+447400123456',
    });
    expect(readPhone('+3545812345', 'DK')).toMatchObject({ text: '581 2345', country: 'IS' });
  });

  it('reads an incomplete number as far as it goes', () => {
    expect(readPhone('+354581', 'IS')).toMatchObject({ text: '581', e164: '+354581' });
  });

  it('is empty for an empty value and keeps the country', () => {
    expect(readPhone('', 'DK')).toMatchObject({ text: '', country: 'DK', e164: '' });
  });
});

describe('isValidPhone and parsePhone', () => {
  it('accepts landlines and mobiles, and refuses a prefix the country does not use', () => {
    expect(isValidPhone('+3545812345')).toBe(true);
    expect(isValidPhone('+3546112345')).toBe(true);
    expect(isValidPhone('+442079460000')).toBe(true);
    expect(isValidPhone('+3541112345')).toBe(false);
    expect(isValidPhone('+35458123')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  it('with a country, the number has to be that country’s', () => {
    expect(isValidPhone('+4532123456', 'DK')).toBe(true);
    expect(isValidPhone('+4532123456', 'IS')).toBe(false);
    expect(isValidPhone('+12045551234', 'US')).toBe(false);
    expect(isValidPhone('+12045551234', 'CA')).toBe(true);
    expect(isValidPhone('5812345', 'IS')).toBe(true);
  });

  it('takes a number apart', () => {
    expect(parsePhone('+3545812345')).toEqual({
      e164: '+3545812345',
      country: 'IS',
      callingCode: '354',
      nationalNumber: '5812345',
      national: '581 2345',
      valid: true,
    });
    expect(parsePhone('nothing')).toBeNull();
  });
});

describe('countries', () => {
  it('lists every country with its dialling code', () => {
    expect(phoneCountries().length).toBeGreaterThan(240);
    expect(phoneCountries()).toContain('IS');
    expect(phoneCallingCode('IS')).toBe('354');
    expect(phoneCallingCode('ZZ')).toBe('');
  });

  it('has an example number for a placeholder', () => {
    expect(phoneExample('IS')).toMatch(/^\d{3} \d{4}$/);
    expect(phoneExample('ZZ')).toBeUndefined();
  });

  it('names a country in the locale asked for', () => {
    expect(phoneCountryName('DK', 'en-US')).toBe('Denmark');
    expect(phoneCountryName('DK', 'is-IS')).toBe('Danmörk');
  });
});

describe('phoneRule', () => {
  it('passes an empty value: required is another rule', () => {
    const rule = phoneRule({ country: 'IS' });
    expect(rule('')).toBe(true);
    expect(rule(undefined)).toBe(true);
    expect(rule(null)).toBe(true);
  });

  it('passes a number the country has, and names the country when it does not', () => {
    const rule = phoneRule({ country: 'IS' });
    expect(rule('+3545812345')).toBe(true);
    expect(rule('+35458123')).toBe('Enter a valid phone number for Iceland.');
    expect(rule('+4532123456')).toBe('Enter a valid phone number for Iceland.');
  });

  it('reads the country each time, so it follows the field', () => {
    let country = 'IS';
    const rule = phoneRule({ country: () => country });
    expect(rule('+4532123456')).toBe('Enter a valid phone number for Iceland.');
    country = 'DK';
    expect(rule('+4532123456')).toBe(true);
  });

  it('without a country, passes any country’s number and names the one the code says', () => {
    const rule = phoneRule();
    expect(rule('+4532123456')).toBe(true);
    expect(rule('+45321')).toBe('Enter a valid phone number for Denmark.');
    expect(rule('+')).toBe('Enter a valid phone number.');
  });

  it('names the country in the locale and with the messages given', () => {
    const rule = phoneRule({ country: 'DK', locale: 'is-IS', messages: isIS });
    expect(rule('+45321')).toBe('Símanúmerið er ekki gilt í landinu sem er valið: Danmörk.');
  });
});

describe('the caret', () => {
  it('counts the typed characters before it: digits, and a + that leads', () => {
    expect(significantBefore('581 2345', 4)).toBe(3);
    expect(significantBefore('581 2345', 5)).toBe(4);
    expect(significantBefore('(201) 555', 6)).toBe(3);
    expect(significantBefore('+45 32', 4)).toBe(3);
    expect(significantBefore('581 2345', 99)).toBe(7);
  });

  it('lands after the same number of typed characters in the new text', () => {
    expect(caretAfter('581 2345', 0)).toBe(0);
    expect(caretAfter('581 2345', 3)).toBe(3);
    expect(caretAfter('581 2345', 4)).toBe(5);
    expect(caretAfter('(201) 555-0123', 1)).toBe(2);
  });

  it('goes to the very end after the last one, past what the format added', () => {
    expect(caretAfter('(201)', 3)).toBe(5);
    expect(caretAfter('581 2345', 7)).toBe(8);
    expect(caretAfter('581', 9)).toBe(3);
  });
});
