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
import type { NavMenuItem, NavMenuLink, NavMenuPart, NavMenuVariant } from './types';

const props = defineProps<{
  item: NavMenuItem;
  idPrefix: string;
  placement: 'bar' | 'drawer';
  variant: NavMenuVariant;
  messages: UiMessages;
  linkAs?: string | Component;
  classes?: Partial<Record<NavMenuPart, string>>;
}>();

defineSlots<{
  panelItem?: (props: { link: NavMenuLink; item: NavMenuItem }) => unknown;
  groupHeading?: (props: { group: string; links: NavMenuLink[]; item: NavMenuItem }) => unknown;
}>();

const links = computed(() => panelLinks(props.item));
const groups = computed(() => groupLinks(links.value));
const grouped = computed(() => groups.value.some((group) => group.group !== null));
const mega = computed(() => props.placement === 'bar' && panelLayout(props.item) === 'mega');
const bar = computed(() => props.placement === 'bar');

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
  partClass(
    cx(
      'flex rounded-md text-body font-semibold eldra-focus',
      bar.value
        ? cx('mb-2 px-3 py-2', BAR_ENTRY[props.variant], BAR_LINK[props.variant])
        : 'py-2.5 text-text',
      CURRENT_PAGE
    ),
    props.classes,
    'overview'
  )
);

const columnsClass = computed(() => {
  if (!grouped.value) return partClass('', props.classes, 'columns');
  return partClass(
    bar.value ? 'grid eldra-nav-menu-columns gap-6' : 'flex flex-col gap-4',
    props.classes,
    'columns'
  );
});

const groupClass = computed(() => partClass('flex min-w-0 flex-col', props.classes, 'group'));

const groupHeadingClass = computed(() =>
  partClass(cx('pb-1 text-overline text-muted', bar.value && 'px-3'), props.classes, 'groupHeading')
);

const panelListClass = computed(() =>
  partClass(
    mega.value && !grouped.value
      ? 'grid eldra-nav-menu-columns gap-x-6 gap-y-0.5'
      : 'flex flex-col gap-0.5',
    props.classes,
    'panelList'
  )
);

const panelItemClass = computed(() => partClass('', props.classes, 'panelItem'));

function panelLinkClass(link: NavMenuLink): string {
  return partClass(
    cx(
      'flex flex-col gap-0.5 rounded-md',
      bar.value ? cx('px-3 py-2', BAR_ENTRY[props.variant]) : 'py-2.5 text-text',
      hasHref(link) && 'eldra-focus',
      hasHref(link) && bar.value && BAR_LINK[props.variant],
      CURRENT_PAGE
    ),
    props.classes,
    'panelLink'
  );
}

const panelLabelClass = computed(() =>
  partClass(
    'flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-medium',
    props.classes,
    'panelLabel'
  )
);

const descriptionClass = computed(() =>
  partClass('text-body-sm text-muted', props.classes, 'description')
);

const badgeClasses = computed(() =>
  props.classes?.badge === undefined ? undefined : { root: props.classes.badge }
);
</script>

<template>
  <component
    :is="navLinkTag(item, linkAs)"
    v-if="hasHref(item)"
    data-eldra-ui
    data-part="overview"
    :class="overviewClass"
    v-bind="navLinkAttrs(item, linkAs)"
  >
    {{ messages.navMenuOverview(item.label ?? '') }}
    <VisuallyHidden v-if="item.newTab">{{ messages.opensInNewTab }}</VisuallyHidden>
  </component>

  <div data-eldra-ui data-part="columns" :class="columnsClass">
    <div v-for="(group, index) in groups" :key="index" data-part="group" :class="groupClass">
      <span
        v-if="group.group !== null"
        :id="headingId(index)"
        data-part="groupHeading"
        :class="groupHeadingClass"
      >
        <slot name="groupHeading" :group="group.group" :links="group.links" :item="item">
          {{ group.group }}
        </slot>
      </span>
      <ul
        data-part="panelList"
        :class="panelListClass"
        :aria-labelledby="group.group !== null ? headingId(index) : undefined"
      >
        <li
          v-for="(link, at) in group.links"
          :key="at"
          data-part="panelItem"
          :class="panelItemClass"
        >
          <component
            :is="navLinkTag(link, linkAs)"
            data-part="panelLink"
            :class="panelLinkClass(link)"
            v-bind="navLinkAttrs(link, linkAs)"
          >
            <slot name="panelItem" :link="link" :item="item">
              <span data-part="panelLabel" :class="panelLabelClass">
                {{ link.label }}
                <Badge v-if="link.badge" :label="link.badge" :classes="badgeClasses" />
              </span>
              <span v-if="link.description" data-part="description" :class="descriptionClass">
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
