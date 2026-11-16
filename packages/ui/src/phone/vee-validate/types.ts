import type { FieldBinding } from '../../vee-validate/types';
import type { PhoneInputProps } from '../types';

export type FieldPhoneInputProps = Omit<PhoneInputProps, 'modelValue' | 'invalid'> &
  FieldBinding<string>;
