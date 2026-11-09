const UTC_ZONES = new Set(
  [
    'UTC',
    'Etc/UTC',
    'UCT',
    'Etc/UCT',
    'GMT',
    'Etc/GMT',
    'Etc/GMT0',
    'Etc/GMT+0',
    'Etc/GMT-0',
    'Greenwich',
    'Zulu',
    'Etc/Zulu',
    'Universal',
    'Etc/Universal',
    'Iceland',
    'Atlantic/Reykjavik',
    'Africa/Abidjan',
  ].map((zone) => zone.toLowerCase())
);

/** Whether `timeZone` is UTC by another name, Reykjavík's included: the only zone the bundled data formats. */
export function isUtcZone(timeZone: string): boolean {
  return UTC_ZONES.has(timeZone.toLowerCase());
}
