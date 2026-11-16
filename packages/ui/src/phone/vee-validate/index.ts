// `@eldrajs/ui/phone/vee-validate`: `PhoneInput` bound to a vee-validate field, and the rule it
// validates with. Not part of `@eldrajs/ui/vee-validate`, which must load in an app that has not
// installed `libphonenumber-js`; this entry needs both optional peers.
export { default as FieldPhoneInput } from './FieldPhoneInput.vue';
export { phoneRule, type PhoneRuleOptions } from '../rule';
export type { FieldPhoneInputProps } from './types';
