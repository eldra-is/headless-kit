const STEGA_CHARACTERS = /[​‌﻿]/g;
const EXPORT_NAME = /^Icon[A-Z0-9][A-Za-z0-9]*$/;
const KEBAB_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The `@tabler/icons-vue` export name (`IconCashRegister`) for a field value in either form Studio content holds, or `null`. */
export function tablerIconName(value: string): string | null {
  const name = value.replace(STEGA_CHARACTERS, '').trim();
  if (EXPORT_NAME.test(name)) return name;
  if (!KEBAB_NAME.test(name)) return null;
  return `Icon${name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`;
}
