<script setup lang="ts">
import { computed, type Component } from 'vue';
import type { UiMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import Badge from '../badge/Badge.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import {
  CURRENT_PAGE,
  groupLinks,
  hasHref,
  navLinkAttrs,
  navLinkTag,
  panelLayout,
  panelLinks,
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

const props = defineProps<{
  item: NavMenuItem;
  idPrefix: string;
  placement: NavMenuPlacement;
  variant: NavMenuVariant;
  messages: UiMessages;
  linkAs?: string | Component;
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

const links = computed(() => panelLinks(props.item));
const groups = computed(() => groupLinks(links.value));
const grouped = computed(() => groups.value.some((group) => group.group !== null));
const mega = computed(() => props.placement === 'bar' && panelLayout(props.item) === 'mega');
const bar = computed(() => props.placement === 'bar');

/** A part's name where it is drawn, so the bar's panels and the drawer's are styled apart. */
function part(name: NavMenuPanelPart): NavMenuPart {
  return bar.value
    ? name
    : (`drawer${name.charAt(0).toUpperCase()}${name.slice(1)}` as NavMenuPart);
}

function panelPartClass(base: string, name: NavMenuPanelPart): string {
  return partClass(base, props.classes, part(name));
}

/** A bar entry's colour at rest, and what a link adds on hover and as the current page. */
const BAR_ENTRY: Record<NavMenuVariant, string> = {
  ghost: 'text-text',
  muted: 'text-muted',
};
const BAR_LINK: Record<NavMenuVariant, string> = {
  ghost: 'hover:bg-surface',
  muted: 'hover:text-text aria-[current=page]:text-text',
};

function headingId(index: number): string {
  return `${props.idPrefix}-group-${index}`;
}

const overviewClass = computed(() =>
  panelPartClass(
    cx(
      'flex rounded-md text-body font-semibold eldra-focus',
      bar.value
        ? cx('mb-2 px-3 py-2', BAR_ENTRY[props.variant], BAR_LINK[props.variant])
        : 'py-2.5 text-text',
      CURRENT_PAGE
    ),
    'overview'
  )
);

const columnsClass = computed(() => {
  if (!grouped.value) return panelPartClass('', 'columns');
  return panelPartClass(
    bar.value ? 'grid eldra-nav-menu-columns gap-6' : 'flex flex-col gap-4',
    'columns'
  );
});

function groupMeta(name: string | null): NavMenuGroup | undefined {
  return name === null ? undefined : props.item.groups?.find((group) => group.label === name);
}

const groupLinkClass = computed(() =>
  panelPartClass(cx('rounded-sm eldra-focus hover:text-text', CURRENT_PAGE), 'groupLink')
);

const groupClass = computed(() => panelPartClass('flex min-w-0 flex-col', 'group'));

const groupHeadingClass = computed(() =>
  panelPartClass(cx('pb-1 text-overline text-muted', bar.value && 'px-3'), 'groupHeading')
);

const panelListClass = computed(() =>
  panelPartClass(
    mega.value && !grouped.value
      ? 'grid eldra-nav-menu-columns gap-x-6 gap-y-0.5'
      : 'flex flex-col gap-0.5',
    'panelList'
  )
);

const panelItemClass = computed(() => panelPartClass('', 'panelItem'));

function panelLinkClass(link: NavMenuLink): string {
  return panelPartClass(
    cx(
      'flex flex-col gap-0.5 rounded-md',
      bar.value ? cx('px-3 py-2', BAR_ENTRY[props.variant]) : 'py-2.5 text-text',
      hasHref(link) && 'eldra-focus',
      hasHref(link) && bar.value && BAR_LINK[props.variant],
      CURRENT_PAGE
    ),
    'panelLink'
  );
}

const panelLabelClass = computed(() =>
  panelPartClass('flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-medium', 'panelLabel')
);

const descriptionClass = computed(() => panelPartClass('text-body-sm text-muted', 'description'));

const badgeClasses = computed(() => {
  const badge = props.classes?.[part('badge')];
  return badge === undefined ? undefined : { root: badge };
});

function listLabel(group: string | null, index: number): string | undefined {
  return group !== null ? headingId(index) : props.labelledBy;
}
</script>

<template>
  <component
    :is="navLinkTag(item, linkAs)"
    v-if="hasHref(item) && !omitOverview"
    data-eldra-ui
    :data-part="part('overview')"
    :class="overviewClass"
    v-bind="navLinkAttrs(item, linkAs)"
  >
    {{ messages.navMenuOverview(item.label ?? '') }}
    <VisuallyHidden v-if="item.newTab">{{ messages.opensInNewTab }}</VisuallyHidden>
  </component>

  <div data-eldra-ui :data-part="part('columns')" :class="columnsClass">
    <div
      v-for="(group, index) in groups"
      :key="index"
      :data-part="part('group')"
      :class="groupClass"
    >
      <span
        v-if="group.group !== null"
        :id="headingId(index)"
        :data-part="part('groupHeading')"
        :class="groupHeadingClass"
      >
        <slot
          name="groupHeading"
          :group="group.group"
          :links="group.links"
          :item="item"
          :placement="placement"
        >
          <component
            :is="navLinkTag(groupMeta(group.group)!, linkAs)"
            v-if="groupMeta(group.group) && hasHref(groupMeta(group.group)!)"
            :data-part="part('groupLink')"
            :class="groupLinkClass"
            v-bind="navLinkAttrs(groupMeta(group.group)!, linkAs)"
          >
            {{ group.group }}
            <VisuallyHidden v-if="groupMeta(group.group)!.newTab">{{
              messages.opensInNewTab
            }}</VisuallyHidden>
          </component>
          <template v-else>{{ group.group }}</template>
        </slot>
      </span>
      <ul
        :data-part="part('panelList')"
        :class="panelListClass"
        :aria-labelledby="listLabel(group.group, index)"
      >
        <li
          v-for="(link, at) in group.links"
          :key="at"
          :data-part="part('panelItem')"
          :class="panelItemClass"
        >
          <component
            :is="navLinkTag(link, linkAs)"
            :data-part="part('panelLink')"
            :class="panelLinkClass(link)"
            v-bind="navLinkAttrs(link, linkAs)"
          >
            <slot name="panelItem" :link="link" :item="item" :placement="placement">
              <span :data-part="part('panelLabel')" :class="panelLabelClass">
                {{ link.label }}
                <Badge v-if="link.badge" :label="link.badge" :classes="badgeClasses" />
              </span>
              <span
                v-if="link.description"
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
