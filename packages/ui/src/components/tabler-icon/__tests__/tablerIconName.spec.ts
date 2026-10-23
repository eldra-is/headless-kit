import { describe, expect, it } from 'vitest';
import { tablerIconName } from '../tablerIconName';

describe('tablerIconName', () => {
  it.each([
    ['IconCashRegister', 'IconCashRegister'],
    ['cash-register', 'IconCashRegister'],
    ['heart-filled', 'IconHeartFilled'],
    ['a-b-2', 'IconAB2'],
    ['2fa', 'Icon2fa'],
    ['3d-cube-sphere', 'Icon3dCubeSphere'],
    ['  calendar  ', 'IconCalendar'],
    ['calendar﻿​‌​﻿', 'IconCalendar'],
  ])('reads %j as %s', (value, expected) => {
    expect(tablerIconName(value)).toBe(expected);
  });

  it.each(['', '   ', '﻿​﻿', 'Cash Register', 'cash_register', 'CashRegister', 'icon-', '-x', '../x'])(
    'refuses %j',
    (value) => {
      expect(tablerIconName(value)).toBeNull();
    }
  );
});
