<script setup lang="ts">
import { computed, type Component } from 'vue';
import type { UiMessages } from '../../composables/useMessages';
import { formatPrice, numberFormat } from '@eldrajs/sdk/format';
import { useEldraUiCurrency, useEldraUiLocale } from '../../composables/useLocale';
import Badge from '../badge/Badge.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import {
  CURRENT_PAGE,
  cardAspectRatio,
  hasHref,
  isCard,
  navLinkAttrs,
  navLinkTag,
  panelLayout,
  panelRuns,
  type NavMenuLinkRun,
} from './navLinks';
import type {
  NavMenuGroup,
  NavMenuGroupHeadingSlotProps,
  NavMenuItem,
  NavMenuLink,
  NavMenuPanelItemSlotProps,
  NavMenuPanelPart,
  NavMenuPart,
  NavMenuPlacement,
  NavMenuVariant,
} from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = defineProps<{
  item: NavMenuItem;
  idPrefix: string;
  placement: NavMenuPlacement;
  variant: NavMenuVariant;
  messages: UiMessages;
  linkAs?: string | Component;
  /** The cards' picture crop as `width:height`. */
  cardAspect?: string;
  classes?: Partial<Record<NavMenuPart, string>>;
  /** Names a list that has no group heading of its own, such as a drawer section's. */
  labelledBy?: string;
  /** Leaves out the link to the item's own page, when its drawer heading already is that link. */
  omitOverview?: boolean;
}>();

defineSlots<{
  panelItem?: (props: NavMenuPanelItemSlotProps) => unknown;
  groupHeading?: (props: NavMenuGroupHeadingSlotProps) => unknown;
}>();

const locale = useEldraUiLocale();
const currency = useEldraUiCurrency();
const aspectStyle = computed(() => ({ aspectRatio: cardAspectRatio(props.cardAspect) }));

/** A card's price in the store currency, or a plain number when the store has none the runtime knows. */
function priceText(amount: number): string {
  const code = currency.value;
  if (code !== undefined && code !== '') {
    try {
      return formatPrice(amount, code, locale.value);
    } catch {
      return `${numberFormat(locale.value, { style: 'decimal' }).format(amount)} ${code}`;
    }
  }
  return numberFormat(locale.value, { style: 'decimal' }).format(amount);
}

const groups = computed(() => panelRuns(props.item));
const grouped = computed(() => groups.value.some((group) => group.group !== null));
const mega = computed(() => props.placement === 'bar' && panelLayout(props.item) === 'mega');
const bar = computed(() => props.placement === 'bar');

/** A part's name where it is drawn, so the bar's panels and the drawer's are styled apart. */
function part(name: NavMenuPanelPart): NavMenuPart {
  return bar.value
    ? name
    : (`drawer${name.charAt(0).toUpperCase()}${name.slice(1)}` as NavMenuPart);
}

function panelPartClass(base: unknown, name: NavMenuPanelPart) {
  return [base, props.classes?.[part(name)]];
}

/** A bar entry's colour at rest, and what a link adds on hover and as the current page. */
const BAR_ENTRY: Record<NavMenuVariant, string> = {
  ghost: 'eldra:text-text',
  muted: 'eldra:text-muted',
};
const BAR_LINK: Record<NavMenuVariant, string> = {
  ghost: 'eldra:hover:bg-surface',
  muted: 'eldra:hover:text-text eldra:aria-[current=page]:text-text',
};

function headingId(index: number): string {
  return `${props.idPrefix}-group-${index}`;
}

const overviewClass = computed(() =>
  panelPartClass(
    [
      'eldra:flex eldra:rounded-md eldra:text-body eldra:font-semibold eldra:eldra-focus',
      bar.value
        ? ['eldra:mb-2 eldra:px-3 eldra:py-2', BAR_ENTRY[props.variant], BAR_LINK[props.variant]]
        : 'eldra:py-2.5 eldra:text-text',
      CURRENT_PAGE,
    ],
    'overview'
  )
);

const columnsClass = computed(() => {
  if (!grouped.value) return panelPartClass('', 'columns');
  return panelPartClass(
    bar.value
      ? 'eldra:grid eldra:eldra-nav-menu-columns eldra:gap-6'
      : 'eldra:flex eldra:flex-col eldra:gap-4',
    'columns'
  );
});

/** A column heading's own page: a section's `headingLink`, else the item's `groups` entry of that name. */
function groupMeta(run: NavMenuLinkRun): NavMenuGroup | NavMenuLink | undefined {
  if (run.group === null) return undefined;
  return run.headingLink ?? props.item.groups?.find((group) => group.label === run.group);
}

/** A column's entries, its "see all" entry last. */
function runEntries(run: NavMenuLinkRun): NavMenuLink[] {
  return run.seeAll != null ? [...run.links, run.seeAll] : run.links;
}

const groupLinkClass = computed(() =>
  panelPartClass(
    ['eldra:rounded-sm eldra:eldra-focus eldra:hover:text-text', CURRENT_PAGE],
    'groupLink'
  )
);

const groupClass = computed(() =>
  panelPartClass('eldra:flex eldra:min-w-0 eldra:flex-col', 'group')
);

/** A heading is indented as the links under it are; a column of cards has no indent to match. */
function groupHeadingClass(run: NavMenuLinkRun) {
  return panelPartClass(
    [
      'eldra:pb-1 eldra:text-overline eldra:text-muted',
      bar.value && !hasCards(run) && 'eldra:px-3',
    ],
    'groupHeading'
  );
}

/** A column with a card in it lays its entries in two columns, cards beside each other. */
function hasCards(run: NavMenuLinkRun): boolean {
  return run.links.some(isCard);
}

function panelListClass(run: NavMenuLinkRun) {
  const listing = hasCards(run)
    ? 'eldra:grid eldra:grid-cols-2 eldra:gap-3'
    : mega.value && !grouped.value
      ? 'eldra:grid eldra:eldra-nav-menu-columns eldra:gap-x-6 eldra:gap-y-0.5'
      : 'eldra:flex eldra:flex-col eldra:gap-0.5';
  return panelPartClass(listing, 'panelList');
}

function panelItemClass(run: NavMenuLinkRun, link: NavMenuLink) {
  // A plain entry between cards takes the whole row rather than half of one.
  return panelPartClass(hasCards(run) && !isCard(link) ? 'eldra:col-span-2' : '', 'panelItem');
}

function panelLinkClass(link: NavMenuLink) {
  if (isCard(link)) {
    return panelPartClass(
      [
        'eldra:flex eldra:min-w-0 eldra:flex-col eldra:gap-2 eldra:rounded-md eldra:text-text eldra:eldra-focus',
        CURRENT_PAGE,
      ],
      'panelLink'
    );
  }
  return panelPartClass(
    [
      'eldra:flex eldra:flex-col eldra:gap-0.5 eldra:rounded-md',
      bar.value
        ? ['eldra:px-3 eldra:py-2', BAR_ENTRY[props.variant]]
        : 'eldra:py-2.5 eldra:text-text',
      hasHref(link) && 'eldra:eldra-focus',
      hasHref(link) && bar.value && BAR_LINK[props.variant],
      CURRENT_PAGE,
    ],
    'panelLink'
  );
}

/*
 * The picture's `alt` is empty on purpose: the title is printed right beside it inside the same link,
 * so the link is already named by it. An `alt` copy of the title makes screen readers say the
 * name twice and axe's `image-redundant-alt` fails it.
 */
const cardClass = computed(() =>
  panelPartClass('eldra:flex eldra:min-w-0 eldra:flex-col eldra:gap-2', 'card')
);
const cardImageClass = computed(() =>
  panelPartClass(
    'eldra:block eldra:w-full eldra:rounded-md eldra:bg-surface eldra:object-cover',
    'cardImage'
  )
);
const cardTitleClass = computed(() =>
  panelPartClass('eldra:text-body-sm eldra:font-medium eldra:text-text', 'cardTitle')
);
const cardPriceClass = computed(() =>
  panelPartClass('eldra:text-body-sm eldra:text-muted', 'cardPrice')
);

const panelLabelClass = computed(() =>
  panelPartClass(
    'eldra:flex eldra:flex-wrap eldra:items-center eldra:gap-x-2 eldra:gap-y-1 eldra:text-body eldra:font-medium',
    'panelLabel'
  )
);

const descriptionClass = computed(() =>
  panelPartClass('eldra:text-body-sm eldra:text-muted', 'description')
);

const badgeClass = computed(() => props.classes?.[part('badge')]);

function listLabel(group: string | null, index: number): string | undefined {
  return group !== null ? headingId(index) : props.labelledBy;
}
</script>

<template>
  <component
    :is="navLinkTag(item, linkAs)"
    v-if="hasHref(item) && !omitOverview"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    :data-part="part('overview')"
    :class="overviewClass"
    v-bind="navLinkAttrs(item, linkAs)"
  >
    {{ messages.navMenuOverview(item.label ?? '') }}
    <VisuallyHidden v-if="item.newTab">{{ messages.opensInNewTab }}</VisuallyHidden>
  </component>

  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    :data-part="part('columns')"
    :class="columnsClass"
  >
    <div
      v-for="(group, index) in groups"
      :key="index"
      :data-part="part('group')"
      :class="groupClass"
    >
      <span
        v-if="group.group !== null"
        :data-eldra-slot="eldra.slotHost('groupHeading')"
        :id="headingId(index)"
        :data-part="part('groupHeading')"
        :class="groupHeadingClass(group)"
      >
        <slot
          name="groupHeading"
          :group="group.group"
          :links="group.links"
          :item="item"
          :placement="placement"
        >
          <component
            :is="navLinkTag(groupMeta(group)!, linkAs)"
            v-if="groupMeta(group) && hasHref(groupMeta(group)!)"
            :data-part="part('groupLink')"
            :class="groupLinkClass"
            v-bind="navLinkAttrs(groupMeta(group)!, linkAs)"
          >
            {{ group.group }}
            <VisuallyHidden v-if="groupMeta(group)!.newTab">{{
              messages.opensInNewTab
            }}</VisuallyHidden>
          </component>
          <template v-else>{{ group.group }}</template>
        </slot>
      </span>
      <ul
        :data-part="part('panelList')"
        :class="panelListClass(group)"
        :aria-labelledby="listLabel(group.group, index)"
      >
        <li
          v-for="(link, at) in runEntries(group)"
          :key="at"
          :data-part="part('panelItem')"
          :class="panelItemClass(group, link)"
        >
          <component
            :is="navLinkTag(link, linkAs)"
            :data-eldra-slot="eldra.slotHost('panelItem')"
            :data-part="part('panelLink')"
            :data-see-all="link === group.seeAll ? '' : undefined"
            :class="panelLinkClass(link)"
            v-bind="navLinkAttrs(link, linkAs)"
          >
            <slot
              name="panelItem"
              :link="link"
              :item="item"
              :placement="placement"
              :is-see-all="link === group.seeAll"
            >
              <span v-if="isCard(link)" :data-part="part('card')" :class="cardClass">
                <img
                  :src="link.card!.image"
                  alt=""
                  :data-part="part('cardImage')"
                  :class="cardImageClass"
                  :style="aspectStyle"
                  loading="lazy"
                  decoding="async"
                />
                <span class="eldra:flex eldra:flex-col eldra:gap-0.5">
                  <span :data-part="part('cardTitle')" :class="cardTitleClass">{{
                    link.card!.title
                  }}</span>
                  <span
                    v-if="link.card!.price !== undefined"
                    :data-part="part('cardPrice')"
                    :class="cardPriceClass"
                    >{{ priceText(link.card!.price) }}</span
                  >
                </span>
              </span>
              <span v-else :data-part="part('panelLabel')" :class="panelLabelClass">
                {{ link.label }}
                <Badge v-if="link.badge" :label="link.badge" :class="badgeClass" />
              </span>
              <span
                v-if="link.description && !isCard(link)"
                :data-part="part('description')"
                :class="descriptionClass"
              >
                {{ link.description }}
              </span>
            </slot>
            <VisuallyHidden v-if="link.newTab && hasHref(link)">
              {{ messages.opensInNewTab }}
            </VisuallyHidden>
          </component>
        </li>
      </ul>
    </div>
  </div>
</template>
