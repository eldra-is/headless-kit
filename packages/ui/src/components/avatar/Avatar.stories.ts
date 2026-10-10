import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Avatar from './Avatar.vue';
import AvatarGroup from './AvatarGroup.vue';
import type { AvatarGroupPerson } from './types';

/**
 * One story per state of the design spec's Avatar section, named after the state it shows.
 * `eldra-starter-spec/images/core/avatar.png` is the review target; `scripts/screenshots.mjs`
 * compares each against the committed baseline in `__screenshots__/`.
 *
 * Two hand-drawn portraits stand in for customer/maker photography, exactly as `Image.stories.ts`
 * does — as `data:` URIs, because the screenshot harness runs offline and a broken external
 * image would be a worse baseline than no image at all (and, for `Avatar`, would silently exercise
 * the error fallback instead of the image state a story like `Image` is meant to show).
 */
const PORTRAIT_ONE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="#d7c9b8"/>
    <circle cx="100" cy="82" r="40" fill="#8a6a52"/>
    <path d="M38 200c0 -54 28 -88 62 -88s62 34 62 88z" fill="#5b3f2b"/>
  </svg>`
)}`;
const PORTRAIT_TWO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="#e7dcc6"/>
    <circle cx="100" cy="80" r="38" fill="#caa06b"/>
    <path d="M34 200c0 -58 30 -92 66 -92s66 34 66 92z" fill="#7a5232"/>
  </svg>`
)}`;

const PEOPLE: AvatarGroupPerson[] = [
  { name: 'Ingrid Solberg', src: PORTRAIT_ONE },
  { name: 'Tomas Berg' },
  { name: 'Maya Okafor', src: PORTRAIT_TWO },
];

const OVERFLOW_PEOPLE: AvatarGroupPerson[] = [
  ...PEOPLE,
  { name: 'Elin Vik' },
  { name: 'Noah Kallio' },
  { name: 'Priya Nair' },
  { name: 'Studio' },
];

const meta = {
  title: 'Display/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  args: { name: 'Maya Okafor' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    decorative: { control: 'boolean' },
    src: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The people/maker identity atom: a round image, initials or a generic user icon —',
          'review authors, testimonial bylines, journal post authors and the account menu.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `image`,',
          '`initials`, `icon`.',
          '',
          '**Fallback order**: `src` (falling back on a load error, via the `<img>` `error`',
          'event) → initials from `name` (first letter of the given and family name, uppercase —',
          '`src/utils/avatar.ts#initialsFromName`) → the generic user icon.',
          '',
          '**`decorative`** (default `true`) hides the avatar from assistive technology —',
          'the right choice whenever the name is printed right next to it, e.g. a review byline.',
          'Set it to `false` for a standalone avatar with nothing else naming the person: it gets',
          '`role="img"` and `aria-label` set to `name` instead (spec "Avatar" → Accessibility,',
          '1.1.1/4.1.2).',
          '',
          '`AvatarGroup` (`AvatarGroup.vue`, same folder) stacks up to three avatars plus a "+N"',
          'counter, all `decorative`, behind one `role="group"` accessible sentence — see the',
          '`Group`/`GroupOverflow` stories below.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A photo, cropped to the circle and covering it without distortion. */
export const Image: Story = { args: { src: PORTRAIT_ONE, name: 'Maya Okafor' } };

/** No `src`: two-letter initials from `name`, uppercase, on `surface-strong`. */
export const Initials: Story = { args: { src: null, name: 'Maya Okafor' } };

/** Neither `src` nor `name`: the generic user icon — a signed-out visitor, an anonymous review. */
export const Icon: Story = { args: { src: null, name: null } };

/** The four diameters (spec "Avatar" → Sizes: 2rem/2.5rem/3.5rem/6rem), each shown with a photo
 * and with initials. */
export const Sizes: Story = {
  render: () => ({
    components: { Avatar },
    setup: () => ({ PORTRAIT_ONE }),
    template: `
      <div class="flex flex-col gap-4">
        <div class="flex items-end gap-4">
          <div v-for="size in ['sm', 'md', 'lg', 'xl']" :key="size" class="flex flex-col items-center gap-1">
            <Avatar :src="PORTRAIT_ONE" name="Maya Okafor" :size="size" />
            <p class="text-caption text-muted">{{ size }}</p>
          </div>
        </div>
        <div class="flex items-end gap-4">
          <div v-for="size in ['sm', 'md', 'lg', 'xl']" :key="size" class="flex flex-col items-center gap-1">
            <Avatar name="Jonas Lindqvist" :size="size" />
            <p class="text-caption text-muted">{{ size }}</p>
          </div>
        </div>
      </div>
    `,
  }),
};

/** `decorative="false"`: `role="img"`, `aria-label="Maya Okafor"` — nothing else on the page
 * names this person, so the avatar carries its own accessible name. */
export const Standalone: Story = {
  render: () => ({
    components: { Avatar },
    setup: () => ({ PORTRAIT_ONE }),
    template: `<Avatar :src="PORTRAIT_ONE" name="Maya Okafor" size="lg" :decorative="false" />`,
  }),
};

/** Three avatars, no overflow: every person gets a circle, each with the 2px `background` ring,
 * overlapping by 25% of the diameter. */
export const Group: Story = {
  render: () => ({
    components: { AvatarGroup },
    setup: () => ({ PEOPLE }),
    template: `<AvatarGroup :people="PEOPLE" label="Makers" />`,
  }),
};

/** Seven people, `max` defaulting to 3: three avatars plus a "+4" counter — never more than four
 * circles in total (spec "Avatar" → Acceptance criteria). */
export const GroupOverflow: Story = {
  render: () => ({
    components: { AvatarGroup },
    setup: () => ({ OVERFLOW_PEOPLE }),
    template: `<AvatarGroup :people="OVERFLOW_PEOPLE" label="Makers" />`,
  }),
};

/** A 20rem container: a byline avatar beside wrapping text, and a group, neither overflowing. */
export const Narrow: Story = {
  render: () => ({
    components: { Avatar, AvatarGroup },
    setup: () => ({ PORTRAIT_ONE, PEOPLE }),
    template: `
      <div class="w-80 border border-border p-4 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Avatar :src="PORTRAIT_ONE" name="Maya Okafor" size="sm" />
          <p class="text-body-sm text-text">
            Maya Okafor <span class="text-muted">· Verified buyer · Oslo</span>
          </p>
        </div>
        <AvatarGroup :people="PEOPLE" label="Makers" />
      </div>
    `,
  }),
};

/**
 * Forced colours. The circle's `surface-strong` fill, the initials/icon `text` colour and the
 * group ring are all replaced by the system palette; nothing here depends on colour alone to
 * carry meaning (1.4.1).
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Avatar, AvatarGroup },
    setup: () => ({ PORTRAIT_ONE, PEOPLE }),
    template: `
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <Avatar :src="PORTRAIT_ONE" name="Maya Okafor" />
          <Avatar name="Jonas Lindqvist" />
          <Avatar />
        </div>
        <AvatarGroup :people="PEOPLE" label="Makers" />
      </div>
    `,
  }),
};
