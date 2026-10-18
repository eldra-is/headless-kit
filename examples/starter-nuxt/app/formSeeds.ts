import type { DeclaredFormSeed } from '@eldrajs/vite-plugin-theme';

/**
 * The forms this theme seeds a site with on its first deploy (`eldra.formSeeds` in
 * `nuxt.config.ts`): the two the starter's own pages use, `contact` and `newsletter`. Core creates
 * a form only when its key is absent and refreshes an unedited seeded form on a theme version bump,
 * so a merchant's edits in Studio's Forms page always win. Every field has a label per locale the
 * starter ships (`en-US`, `is-IS`); a merchant adds the rest in Studio.
 *
 * Also the source of the demo storefront's form definitions (`app/storefront/demo.ts`), so
 * Storybook, the block specs and the deployed site agree on what these two forms are. Nothing here
 * reaches the browser bundle except through that demo module, which is `.storybook`/test-only.
 */
export function starterFormSeeds(): DeclaredFormSeed[] {
  return [
    {
      key: 'contact',
      name: 'Contact',
      fields: [
        {
          id: 'name',
          type: 'text',
          required: true,
          label: { 'en-US': 'Name', 'is-IS': 'Nafn' },
        },
        {
          id: 'email',
          type: 'email',
          required: true,
          label: { 'en-US': 'Email address', 'is-IS': 'Netfang' },
          placeholder: { 'en-US': 'name@example.com', 'is-IS': 'nafn@example.is' },
        },
        {
          id: 'topic',
          type: 'text',
          required: false,
          label: { 'en-US': 'What is it about?', 'is-IS': 'Um hvað er málið?' },
          validation: { maxLength: 120 },
        },
        {
          id: 'orderNumber',
          type: 'text',
          required: false,
          label: { 'en-US': 'Order number', 'is-IS': 'Pöntunarnúmer' },
        },
        {
          id: 'message',
          type: 'textarea',
          required: true,
          label: { 'en-US': 'Message', 'is-IS': 'Skilaboð' },
          validation: { minLength: 10, maxLength: 4000 },
        },
      ],
      actions: { notify: true, confirm: true },
      success: {
        message: {
          'en-US': 'Thanks. We reply within one business day, usually sooner.',
          'is-IS': 'Takk fyrir. Við svörum innan eins virks dags, oftast fyrr.',
        },
      },
    },
    {
      key: 'newsletter',
      name: 'Newsletter',
      fields: [
        {
          id: 'email',
          type: 'email',
          required: true,
          label: { 'en-US': 'Email address', 'is-IS': 'Netfang' },
          placeholder: { 'en-US': 'name@example.com', 'is-IS': 'nafn@example.is' },
        },
      ],
      actions: { notify: false, confirm: false, subscribe: { list: 'newsletter' } },
      success: {
        message: {
          'en-US': 'Check your inbox to confirm your subscription.',
          'is-IS': 'Kíktu í pósthólfið til að staðfesta áskriftina.',
        },
      },
    },
  ];
}
