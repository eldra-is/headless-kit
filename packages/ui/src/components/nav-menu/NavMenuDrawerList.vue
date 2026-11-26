<script setup lang="ts">
import { computed, normalizeClass, useSlots, type Component } from 'vue';
import type { UiMessages } from '../../composables/useMessages';
import { useEldraScope } from '../../composables/useEldraScope';
import AccordionItem from '../accordion/AccordionItem.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import NavMenuPanel from './NavMenuPanel.vue';
import { CURRENT_PAGE, hasHref, hasPanel, navLinkAttrs, navLinkTag } from './navLinks';
import type {
  NavMenuDrawerLayout,
  NavMenuGroupHeadingSlotProps,
  NavMenuItem,
  NavMenuPanelItemSlotProps,
  NavMenuPart,
  NavMenuVariant,
} from './types';

/**
 * The drawer's list of entries, the same in the modal sheet and the inline drawer: a plain link, an
 * accordion row that opens its panel, or (`sections`) a heading row with its panel listed open.
 */
const props = defineProps<{
  entries: readonly { item: NavMenuItem; index: number }[];
  layout: NavMenuDrawerLayout;
  /** The bar's panel id for an entry; the drawer's own ids are derived from it. */
  panelId: (index: number) => string;
  navLabel: string;
  variant: NavMenuVariant;
  messages: UiMessages;
  linkAs?: string | Component;
  cardAspect?: string;
  classes?: Partial<Record<NavMenuPart, string>>;
}>();

const emit = defineEmits<{ follow: [] }>();

defineSlots<{
  panelItem?: (props: NavMenuPanelItemSlotProps) => unknown;
  groupHeading?: (props: NavMenuGroupHeadingSlotProps) => unknown;
}>();

const slots = useSlots();
const eldra = useEldraScope();

const sections = computed(() => props.layout === 'sections');

function onClick(event: MouseEvent): void {
  if ((event.target as Element | null)?.closest('a') != null) emit('follow');
}

const listClass = computed(() => ['eldra:flex eldra:flex-col', props.classes?.drawerList]);

// Every top-level row in the drawer, link, accordion row or section heading, is this tall.
const DRAWER_ROW = 'eldra:eldra-nav-menu-drawer-row';

/** An entry the theme marked `tone: 'accent'` (a "Sale" link) is drawn in the accent colour. */
function toneClass(item: NavMenuItem): string {
  return item.tone === 'accent' ? 'eldra:text-accent' : 'eldra:text-text';
}

function itemClass(item: NavMenuItem) {
  if (!hasPanel(item)) return ['eldra:border-b eldra:border-border', props.classes?.drawerItem];
  const section = sections.value
    ? 'eldra:flex eldra:flex-col eldra:border-b eldra:border-border eldra:pb-4'
    : '';
  return [section, props.classes?.drawerItem];
}

function sectionHeadingClass(item: NavMenuItem) {
  return [
    [
      DRAWER_ROW,
      'eldra:flex eldra:w-full eldra:items-center eldra:rounded-sm eldra:py-4 eldra:text-accordion-title',
      toneClass(item),
      hasHref(item) && ['eldra:eldra-focus', CURRENT_PAGE],
    ],
    props.classes?.drawerSectionHeading,
  ];
}

function linkClass(item: NavMenuItem) {
  return [
    [
      DRAWER_ROW,
      'eldra:flex eldra:w-full eldra:items-center eldra:rounded-sm eldra:py-4',
      'eldra:text-accordion-title eldra:eldra-focus',
      toneClass(item),
      CURRENT_PAGE,
    ],
    props.classes?.drawerLink,
  ];
}

const nestClass = computed(() => [
  'eldra:flex eldra:flex-col eldra:ms-1 eldra:border-s eldra:border-border eldra:eldra-nav-menu-drawer-nest',
  props.classes?.drawerNest,
]);

const accordionClasses = computed(() => ({
  summary: normalizeClass([DRAWER_ROW, props.classes?.drawerTrigger]),
  panel: normalizeClass([
    'eldra:max-w-none eldra:pb-4 eldra:text-text',
    props.classes?.drawerPanel,
  ]),
}));
</script>

<template>
  <nav
    v-if="entries.length > 0"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    :aria-label="navLabel"
    @click="onClick"
  >
    <ul data-part="drawerList" :class="listClass">
      <li
        v-for="{ item, index } in entries"
        :key="index"
        data-part="drawerItem"
        :class="itemClass(item)"
      >
        <template v-if="hasPanel(item) && sections">
          <component
            :is="navLinkTag(item, linkAs)"
            :id="`${panelId(index)}-drawer-heading`"
            data-part="drawerSectionHeading"
            :data-tone="item.tone"
            :class="sectionHeadingClass(item)"
            v-bind="navLinkAttrs(item, linkAs)"
          >
            {{ item.label }}
            <VisuallyHidden v-if="item.newTab && hasHref(item)">{{
              messages.opensInNewTab
            }}</VisuallyHidden>
          </component>
          <div data-part="drawerNest" :class="nestClass">
            <NavMenuPanel
              :item="item"
              :id-prefix="`${panelId(index)}-drawer`"
              placement="drawer"
              :variant="variant"
              :messages="messages"
              :link-as="linkAs"
              :card-aspect="cardAspect"
              :classes="classes"
              :labelled-by="`${panelId(index)}-drawer-heading`"
              :omit-overview="hasHref(item)"
            >
              <template v-if="slots.panelItem" #panelItem="scope">
                <slot name="panelItem" v-bind="scope" />
              </template>
              <template v-if="slots.groupHeading" #groupHeading="scope">
                <slot name="groupHeading" v-bind="scope" />
              </template>
            </NavMenuPanel>
          </div>
        </template>
        <AccordionItem
          v-else-if="hasPanel(item)"
          :title="item.label ?? ''"
          :classes="accordionClasses"
        >
          <div :data-eldra-scope="eldra.scope" data-part="drawerNest" :class="nestClass">
            <NavMenuPanel
              :item="item"
              :id-prefix="`${panelId(index)}-drawer`"
              placement="drawer"
              :variant="variant"
              :messages="messages"
              :link-as="linkAs"
              :card-aspect="cardAspect"
              :classes="classes"
            >
              <template v-if="slots.panelItem" #panelItem="scope">
                <slot name="panelItem" v-bind="scope" />
              </template>
              <template v-if="slots.groupHeading" #groupHeading="scope">
                <slot name="groupHeading" v-bind="scope" />
              </template>
            </NavMenuPanel>
          </div>
        </AccordionItem>
        <component
          :is="navLinkTag(item, linkAs)"
          v-else
          data-part="drawerLink"
          :data-tone="item.tone"
          :class="linkClass(item)"
          v-bind="navLinkAttrs(item, linkAs)"
        >
          {{ item.label }}
          <VisuallyHidden v-if="item.newTab && hasHref(item)">{{
            messages.opensInNewTab
          }}</VisuallyHidden>
        </component>
      </li>
    </ul>
  </nav>
</template>
