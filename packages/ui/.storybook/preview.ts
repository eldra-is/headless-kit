import { h } from 'vue';
import type { Decorator, Preview } from '@storybook/vue3-vite';
import './preview.css';

/**
 * The five section colours a storefront section can be painted in. Every
 * component has to read correctly on all of them, so they are the Storybook
 * backgrounds and the decorator paints the matching text colour with them —
 * a white-on-white Button on `primary` is a bug the story should show.
 *
 * The values are the theme variables, never literals: restyling the tokens
 * restyles Storybook too.
 */
const SECTIONS = {
  background: {
    name: 'Background',
    value: 'var(--eldra-color-background)',
    classes: 'bg-background text-text',
  },
  surface: {
    name: 'Surface',
    value: 'var(--eldra-color-surface)',
    classes: 'bg-surface text-text',
  },
  'surface-strong': {
    name: 'Surface strong',
    value: 'var(--eldra-color-surface-strong)',
    classes: 'bg-surface-strong text-text',
  },
  primary: {
    name: 'Primary',
    value: 'var(--eldra-color-primary)',
    classes: 'bg-primary text-primary-contrast',
  },
  accent: {
    name: 'Accent',
    value: 'var(--eldra-color-accent)',
    classes: 'bg-accent text-accent-contrast',
  },
} as const;

type SectionName = keyof typeof SECTIONS;

const DEFAULT_SECTION: SectionName = 'background';

function sectionOf(globals: Record<string, unknown>): SectionName {
  const selected = (globals.backgrounds as { value?: string } | undefined)?.value;
  return selected !== undefined && selected in SECTIONS
    ? (selected as SectionName)
    : DEFAULT_SECTION;
}

/**
 * Wraps every story in the selected section: `data-section` so a component can
 * be inspected (and asserted on) for the surface it sits on, plus the section's
 * own background and text colour so the story matches what the toolbar says.
 */
const withSection: Decorator = (story, context) => {
  const section = sectionOf(context.globals);
  return {
    setup: () => () =>
      h('div', { 'data-section': section, class: `${SECTIONS[section].classes} font-body p-6` }, [
        h(story()),
      ]),
  };
};

const preview: Preview = {
  decorators: [withSection],
  parameters: {
    a11y: { test: 'error' },
    backgrounds: {
      options: Object.fromEntries(
        Object.entries(SECTIONS).map(([key, { name, value }]) => [key, { name, value }])
      ),
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  initialGlobals: { backgrounds: { value: DEFAULT_SECTION } },
};

export default preview;
