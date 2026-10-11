import type { UnitInputPart, UnitInputProps } from '../unit-input/types';

/** `CurrencyInput` is a `UnitInput`, so its parts are the same ones. */
export type CurrencyInputPart = UnitInputPart;

/**
 * Everything `UnitInput` takes except the two things a money field decides for itself: it is
 * always a currency, and a currency has no `unit`.
 */
export type CurrencyInputProps = Omit<UnitInputProps, 'isCurrency' | 'unit'>;
