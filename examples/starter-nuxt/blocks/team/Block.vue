<script setup lang="ts">
/**
 * Team: a grid of the people behind the shop, each with a photo, name, role, short bio and
 * optional links (spec `02-blocks.md` 2102–2192, "Team"). No `variant` field.
 *
 * Every person is one shared shape at every breakpoint — only the surrounding `<ul>`/`<li>` change
 * their layout through container queries, the same "one card shape, sized differently" split
 * `testimonials` uses for its own `figure`. Breakpoints follow this codebase's own container-query
 * scale (`packages/ui/src/styles/tailwind.css`): the spec's "36rem of the block's own width" is
 * this package's extra `@two-col` variant (`--container-two-col: 36rem`), and "64rem" is `@content`
 * (`--container-content`) — never a viewport media query.
 *
 * Layout (spec → Layout):
 *  - Below `@two-col` (36rem): one column of rows (`grid-cols-1`, `gap-y-6` = 1.5rem apart). Each
 *    `<li>` is a row (`flex`): a 6.5rem-wide 4:5 photo beside the body, 1rem gap, top-aligned.
 *  - From `@two-col`: 2 columns (`gap-y-12`/`gap-x-6` = 3rem row × 1.5rem column gap); each `<li>`
 *    switches to a column (`flex-col`) so the photo sits above the text, still a 1rem gap, and the
 *    photo grows to the column's own width instead of staying a fixed 6.5rem thumbnail.
 *  - From `@content` (64rem): 4 columns, in the `wide` (80rem) container.
 *  - A single rendered person caps the whole grid at 18rem (`isSinglePerson`), the same "cap and
 *    centre a lone item" move `testimonials`' grid variant makes for one review.
 *
 * `people[].photo` is optional (spec States, "No image"): with no photo, the person becomes
 * text-only with a 1px `border-t` rule and 1rem top padding so the grid still reads as a set — the
 * same "top rule instead of a card" convention `stats`' own item border uses, applied per item here
 * rather than to a whole grid.
 *
 * Icon links (`people[].links`) resolve through `@eldrajs/ui`'s `Button` (`variant="ghost"`,
 * `iconOnly`, `size="sm"` — the spec's 2rem target), the same `#leadingIcon` + `EldraIcon` recipe
 * `footer`'s own social row uses: the button's `label` prop is its one accessible-name prop (see
 * `Button.vue`'s own `ariaLabel` computed — `iconOnly` always names the control from `label`, never
 * a package-wide `ariaLabel` prop, which this component set only gives to `Section`/`Carousel`/
 * `Tabs`/`Lightbox`/`Drawer`/`SearchModal`/`ChipGroup`/`Pagination`/`AvatarGroup`), and the icon
 * itself stays `aria-hidden` (`EldraIcon` with no `label` of its own — `Icon.vue`'s default). A
 * `mailto:` href passes `safeHref` like any other (`app/utils/links.ts` allows the `mailto:`
 * protocol), and a same-site `href` (never expected among these five link types in practice, but
 * handled the same way every other block does) routes through `EldraRouterLink`.
 *
 * "Live: only people with a name or role render; editing: every person renders, including a
 * freshly seeded blank repeater item, which shows its own hint instead of vanishing" is the same
 * split `testimonials`/`stats` use for their own list items. The whole section additionally gates
 * on there being at least one real person at all (`hasPeople || isEditing`) — spec States, "Empty
 * (freshly inserted)": "Live site renders nothing for an empty list" — the same "the list is the
 * one thing this block cannot do without" reasoning `faq` applies to its own `items`.
 */
import { computed } from 'vue';
import { Button, Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import type { ThemeIconName } from '../../app/icons';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import type { MessageKey } from '../../app/i18n/messages';

const props = defineProps<{ entry: EldraBlockEntry<'team'> }>();
const { data } = useBlockData(props, 'team');
const t = useT();
const isEditing = useEditing();
const headingId = `team-heading-${useUiId()}`;

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');

const linkHref = computed(() => safeHref(data.value.linkHref));
const hasLink = computed(() => Boolean(data.value.linkLabel) && linkHref.value !== null);
const linkAs = computed(() =>
  linkHref.value !== null && isInternalHref(linkHref.value) ? EldraRouterLink : undefined
);

const hasHead = computed(
  () => hasHeading.value || hasIntro.value || hasLink.value || showHeadingHint.value
);

interface PersonLink {
  type?: 'instagram' | 'email' | 'website' | 'tiktok' | 'pinterest';
  href?: string;
}

interface Person {
  photo?: EldraMedia;
  name?: string;
  role?: string;
  bio?: string;
  links?: PersonLink[];
}

function isPersonEmpty(person: Person): boolean {
  return (person.name ?? '').trim() === '' && (person.role ?? '').trim() === '';
}

const allPeople = computed<Person[]>(() => data.value.people ?? []);
/** Editing always shows at least one item: a genuinely empty `people` list (a block just dragged
 *  onto the page, before Studio's own repeater has seeded anything) still gets one synthetic blank
 *  person so its "Add a person" hint has somewhere to render (spec → States, "Empty (freshly
 *  inserted)": "a striped 4:5 photo placeholder and 'Add a person'"). */
const editorPeople = computed<Person[]>(() =>
  allPeople.value.length > 0 ? allPeople.value : [{}]
);
/** Live: only people with a name or role render (Global Constraints, "Editor vs live"); editing:
 *  every person renders, so a still-empty repeater item shows its own hint instead of vanishing. */
const renderedPeople = computed(() =>
  isEditing.value ? editorPeople.value : allPeople.value.filter((person) => !isPersonEmpty(person))
);
const hasPeople = computed(() => renderedPeople.value.length > 0);

/** Spec "Team" → Layout: "A single person's grid is capped at 18rem wide." */
const isSinglePerson = computed(() => renderedPeople.value.length === 1);
const gridClass = computed(() => [
  'grid grid-cols-1 gap-y-6 @two-col:grid-cols-2 @two-col:gap-x-6 @two-col:gap-y-12 @content:grid-cols-4',
  isSinglePerson.value ? 'mx-auto max-w-[18rem]' : '',
]);

/** Typed against the theme's own icon set, so a name it does not bundle is a type error. */
const ICON_NAMES: Record<NonNullable<PersonLink['type']>, ThemeIconName> = {
  instagram: 'brand-instagram',
  email: 'mail',
  website: 'world',
  tiktok: 'brand-tiktok',
  pinterest: 'brand-pinterest',
};

const NAME_KEYS: Record<NonNullable<PersonLink['type']>, MessageKey> = {
  instagram: 'team.onInstagram',
  email: 'team.emailPerson',
  website: 'team.website',
  tiktok: 'team.onTiktok',
  pinterest: 'team.onPinterest',
};

interface ResolvedLink {
  type: NonNullable<PersonLink['type']>;
  href: string;
  as: typeof EldraRouterLink | undefined;
  icon: string;
  label: string;
}

/** Drops a link with no known type or an unsafe/missing href — the same "skip, don't crash" shape
 *  `footer`'s own `resolveLinks` uses. */
function resolveLinks(person: Person): ResolvedLink[] {
  const name = person.name ?? '';
  return (person.links ?? []).flatMap((link) => {
    const type = link.type;
    const href = safeHref(link.href);
    // A `type` outside the field's own option set (stale content after an option is removed, or
    // a hand-edited entry) has no icon and no name template, so the link is skipped rather than
    // crashing the whole block on a missing message key.
    if (type === undefined || !(type in ICON_NAMES) || href === null) return [];
    return [
      {
        type,
        href,
        as: isInternalHref(href) ? EldraRouterLink : undefined,
        icon: ICON_NAMES[type],
        label: t(NAME_KEYS[type], { name }),
      },
    ];
  });
}

interface DisplayPerson extends Person {
  resolvedLinks: ResolvedLink[];
}

/** Resolved once per person per render (not re-derived per icon in the template), the same
 *  "compute the list once" shape `footer`'s own `socialLinks` computed uses. */
const displayPeople = computed<DisplayPerson[]>(() =>
  renderedPeople.value.map((person) => ({ ...person, resolvedLinks: resolveLinks(person) }))
);

/** Spec "Team" → Keyboard & accessibility: "Photo alt defaults to 'Portrait of {name}' (the editor
 *  can override it)." An explicit, non-empty `altText` always wins. */
function photoAlt(person: Person): string {
  const altText = (person.photo?.altText ?? '').trim();
  return altText !== '' ? altText : t('team.portraitOf', { name: person.name ?? '' });
}

/** Spec "Team" → States, "No image": a person with no photo gets a 1px top rule instead — not
 *  applied to a still-empty editor placeholder, which draws its own dashed border. */
function itemClass(person: Person): string {
  if (isEditing.value && isPersonEmpty(person)) return '';
  return person.photo ? '' : 'border-border border-t pt-4';
}
</script>

<template>
  <Section
    v-if="hasPeople || isEditing"
    :background="sectionBackground"
    spacing="md"
    :labelled-by="headingId"
  >
    <Container width="wide">
      <div v-if="hasHead" class="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div class="max-w-[40rem]">
          <h2
            v-if="hasHeading"
            :id="headingId"
            class="font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
          >
            {{ heading }}
          </h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('team.headingHintLabel')"
            :help="t('team.headingHintHelp')"
          />
          <p v-if="hasIntro" class="text-muted mt-2 text-base">{{ intro }}</p>
        </div>
        <Link
          v-if="hasLink"
          :href="linkHref!"
          :as="linkAs"
          variant="standalone"
          arrow
          :underline="false"
        >
          {{ data.linkLabel }}
        </Link>
      </div>

      <ul role="list" :class="gridClass">
        <li
          v-for="(person, index) in displayPeople"
          :key="index"
          class="@two-col:flex-col flex gap-4"
          :class="itemClass(person)"
        >
          <EditorPlaceholder
            v-if="isEditing && isPersonEmpty(person)"
            inline
            class="w-full"
            :label="t('team.itemHintLabel')"
            :help="t('team.itemHintHelp')"
          />
          <template v-else>
            <UiImage
              v-if="person.photo"
              :src="person.photo.url"
              :alt="photoAlt(person)"
              :framing="person.photo.framing ?? null"
              aspect="4/5"
              rounded="lg"
              class="@two-col:w-full @two-col:shrink w-[6.5rem] shrink-0"
            />
            <div class="flex min-w-0 flex-col gap-1">
              <h3 class="font-heading text-[1.125rem] font-semibold">{{ person.name }}</h3>
              <p class="text-muted text-body-sm font-semibold">{{ person.role }}</p>
              <p v-if="person.bio" class="text-muted text-body-sm mt-1">{{ person.bio }}</p>
              <ul
                v-if="person.resolvedLinks.length > 0"
                role="list"
                class="-ml-2 flex items-center gap-1"
              >
                <li v-for="link in person.resolvedLinks" :key="link.type">
                  <Button
                    icon-only
                    variant="ghost"
                    size="sm"
                    :href="link.href"
                    :as="link.as"
                    :label="link.label"
                  >
                    <template #leadingIcon>
                      <EldraIcon :name="link.icon" size="sm" />
                    </template>
                  </Button>
                </li>
              </ul>
            </div>
          </template>
        </li>
      </ul>
    </Container>
  </Section>
</template>
