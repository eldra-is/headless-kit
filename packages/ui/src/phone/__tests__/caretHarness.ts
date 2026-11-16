// Bundled by `phoneCaret.browser.spec.ts` and run in a real browser: one `PhoneInput`, mounted.
import { createApp, h, ref } from 'vue';
import PhoneInput from '../PhoneInput.vue';

export function mountPhone(host: HTMLElement, defaultCountry: string): void {
  const value = ref('');
  createApp(() =>
    h(PhoneInput, {
      defaultCountry,
      modelValue: value.value,
      'onUpdate:modelValue': (next: string) => {
        value.value = next;
        host.dataset.value = next;
      },
      'aria-label': 'Phone number',
    })
  ).mount(host);
}
