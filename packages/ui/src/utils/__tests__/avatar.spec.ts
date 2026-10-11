import { describe, expect, it } from 'vitest';
import { initialsFromName } from '../avatar';

describe('initialsFromName', () => {
  it("takes the first letter of the given and family name ('Maya Okafor' -> 'MO')", () => {
    expect(initialsFromName('Maya Okafor')).toBe('MO');
  });

  it("takes the first letter of the given and family name ('Jonas Lindqvist' -> 'JL')", () => {
    expect(initialsFromName('Jonas Lindqvist')).toBe('JL');
  });

  it('uppercases initials from a lower-case name', () => {
    expect(initialsFromName('maya okafor')).toBe('MO');
  });

  it('ignores a middle name: first and last word only', () => {
    expect(initialsFromName('Maya Adaeze Okafor')).toBe('MO');
  });

  it('collapses repeated internal whitespace', () => {
    expect(initialsFromName('Maya   Okafor')).toBe('MO');
  });

  it('trims leading and trailing whitespace', () => {
    expect(initialsFromName('  Maya Okafor  ')).toBe('MO');
  });

  it('takes the first two letters of a single-word name', () => {
    expect(initialsFromName('Cher')).toBe('CH');
  });

  it('takes the one letter a single-character name has', () => {
    expect(initialsFromName('X')).toBe('X');
  });

  it('returns an empty string for an empty name', () => {
    expect(initialsFromName('')).toBe('');
  });

  it('returns an empty string for a whitespace-only name', () => {
    expect(initialsFromName('   ')).toBe('');
  });
});
