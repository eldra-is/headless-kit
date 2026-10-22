<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  toRef,
  useSlots,
  watch,
  type ComponentPublicInstance,
} from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { useOverlay } from '../../composables/useOverlay';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import AccordionItem from '../accordion/AccordionItem.vue';
import Drawer from '../drawer/Drawer.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import NavMenuPanel from './NavMenuPanel.vue';
import { useNavMenuKeys } from './navMenuKeys';
import {
  CURRENT_PAGE,
  containsCurrent,
  hasHref,
  hasPanel,
  isRenderableLink,
  navLinkAttrs,
  navLinkTag,
  panelLayout,
} from './navLinks';
import type {
  NavMenuCollapse,
  NavMenuItem,
  NavMenuLink,
  NavMenuProps,
  NavMenuVariant,
} from './types';

const props = withDefaults(defineProps<NavMenuProps>(), {
  variant: 'ghost',
  modelValue: undefined,
  drawerOpen: undefined,
  ariaLabel: undefined,
  collapseBelow: 'lg',
  drawerSide: 'left',
  openOnHover: false,
  linkAs: undefined,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [index: number | null];
  'update:drawerOpen': [open: boolean];
}>();

defineSlots<{
  /** The inside of one panel entry; the link around it stays the menu's. */
  panelItem?: (props: { link: NavMenuLink; item: NavMenuItem }) => unknown;
  /** A column heading's text. */
  groupHeading?: (props: { group: string; links: NavMenuLink[]; item: NavMenuItem }) => unknown;
  /** Extra content at the foot of every panel. */
  panelFooter?: (props: { item: NavMenuItem; index: number; close: () => void }) => unknown;
  /** The menu button's inside, replacing the icon. */
  toggle?: (props: { open: boolean }) => unknown;
  /** The drawer's fixed footer. */
  drawerFooter?: (props: { close: () => void }) => unknown;
}>();

const slots = useSlots();
const m = useMessages(() => props.messages);

const openIndex = useControllableModel<number | null>(props, emit, () => null);
const drawerOpen = useControllableModel<boolean>(
  {
    get modelValue() {
      return props.drawerOpen;
    },
  },
  (_event, value) => emit('update:drawerOpen', value),
  () => false
);

const baseId = useUiId('nav-menu');
const navLabel = computed(() => props.ariaLabel ?? m.value.navMenuLabel);

const entries = computed(() =>
  props.items
    .map((item, index) => ({ item, index }))
    .filter((entry) => isRenderableLink(entry.item))
);

function panelId(index: number): string {
  return `${baseId.value}-panel-${index}`;
}

const drawerId = computed(() => `${baseId.value}-drawer`);

const triggerEls: Array<HTMLElement | null> = [];
const panelEls: Array<HTMLElement | null> = [];
const listEl = ref<HTMLElement | null>(null);

function elementOf(value: Element | ComponentPublicInstance | null): HTMLElement | null {
  return value instanceof HTMLElement ? value : null;
}

/** Set when a resting mouse pointer opened the panel, so leaving the menu closes it again. */
let openedByHover = false;
/** The last panel opened; still set while it closes, so Escape can return focus to its trigger. */
let lastIndex: number | null = null;

watch(
  openIndex,
  (index) => {
    if (index !== null) lastIndex = index;
  },
  { immediate: true }
);

/** How long a mouse pointer rests before a panel opens, and may stray before one closes. */
const HOVER_INTENT_MS = 150;
let hoverOpenTimer: ReturnType<typeof setTimeout> | undefined;
let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

function clearHoverTimers(): void {
  clearTimeout(hoverOpenTimer);
  clearTimeout(hoverCloseTimer);
  hoverOpenTimer = undefined;
  hoverCloseTimer = undefined;
}

function openPanel(index: number, byHover = false): void {
  clearHoverTimers();
  openedByHover = byHover;
  // Set before focus moves, so the overlay's focusout check already sees the new panel as inside.
  lastIndex = index;
  openIndex.value = index;
}

function closePanel(): void {
  clearHoverTimers();
  openedByHover = false;
  if (openIndex.value !== null) openIndex.value = null;
}

useOverlay({
  open: computed(() => openIndex.value !== null),
  trigger: toRef(() => (lastIndex === null ? null : (triggerEls[lastIndex] ?? null))),
  content: toRef(() => (lastIndex === null ? null : (panelEls[lastIndex] ?? null))),
  setOpen: (next) => {
    if (!next) closePanel();
  },
});

function onTriggerClick(index: number): void {
  if (openIndex.value !== index) {
    openPanel(index);
    return;
  }
  // A click on a panel a hover opened keeps it open rather than closing it under the pointer.
  if (openedByHover) openedByHover = false;
  else closePanel();
}

function onTriggerPointerEnter(index: number, event: PointerEvent): void {
  if (!props.openOnHover || event.pointerType !== 'mouse') return;
  clearTimeout(hoverOpenTimer);
  if (openIndex.value === index) return;
  hoverOpenTimer = setTimeout(() => openPanel(index, true), HOVER_INTENT_MS);
}

function onTriggerPointerLeave(event: PointerEvent): void {
  if (event.pointerType === 'mouse') clearTimeout(hoverOpenTimer);
}

function onRootPointerEnter(event: PointerEvent): void {
  if (event.pointerType === 'mouse') clearTimeout(hoverCloseTimer);
}

function onRootPointerLeave(event: PointerEvent): void {
  if (!props.openOnHover || event.pointerType !== 'mouse') return;
  clearTimeout(hoverOpenTimer);
  if (!openedByHover) return;
  hoverCloseTimer = setTimeout(() => {
    // Keyboard focus inside the panel outranks the pointer leaving it.
    const panel = lastIndex === null ? null : panelEls[lastIndex];
    if (panel?.contains(document.activeElement) === true) return;
    if (openedByHover) closePanel();
  }, HOVER_INTENT_MS);
}

const onBarKeydown = useNavMenuKeys({
  list: listEl,
  indexAt: (position) => entries.value[position]?.index ?? -1,
  panel: (index) => panelEls[index] ?? null,
  openIndex,
  open: (index) => openPanel(index),
  close: closePanel,
});

function onPanelClick(event: MouseEvent): void {
  if ((event.target as Element | null)?.closest('a') != null) closePanel();
}

function closeDrawer(): void {
  if (drawerOpen.value) drawerOpen.value = false;
}

// A modal drawer left open while the screen widens past collapseBelow keeps the now visible bar inert.
const toggleEl = ref<HTMLButtonElement | null>(null);

function closeDrawerOnWideScreen(): void {
  if (toggleEl.value && getComputedStyle(toggleEl.value).display === 'none') closeDrawer();
}

watch(drawerOpen, (open) => {
  if (typeof window === 'undefined') return;
  if (open) window.addEventListener('resize', closeDrawerOnWideScreen);
  else window.removeEventListener('resize', closeDrawerOnWideScreen);
});

onBeforeUnmount(() => {
  clearHoverTimers();
  window.removeEventListener('resize', closeDrawerOnWideScreen);
});

function onDrawerClick(event: MouseEvent): void {
  if ((event.target as Element | null)?.closest('a') != null) closeDrawer();
}

/** Closes the open panel and the drawer, for a router's navigation hook. */
function close(): void {
  closePanel();
  closeDrawer();
}

defineExpose({ close });

// Static strings, so Tailwind's source scan sees every variant.
const BAR_DISPLAY: Record<Exclude<NavMenuCollapse, 'always'>, string> = {
  md: 'hidden md:block',
  lg: 'hidden lg:block',
  xl: 'hidden xl:block',
  '@tablet': 'hidden @tablet:block',
  '@content': 'hidden @content:block',
  '@wide': 'hidden @wide:block',
  never: 'block',
};
const TOGGLE_DISPLAY: Record<Exclude<NavMenuCollapse, 'never'>, string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
  '@tablet': '@tablet:hidden',
  '@content': '@content:hidden',
  '@wide': '@wide:hidden',
  always: '',
};

const PANEL_TRANSITION = {
  enterFromClass: '',
  enterActiveClass: '',
  enterToClass: '',
  leaveFromClass: '',
  leaveActiveClass: 'pointer-events-none transition-opacity duration-fast ease-in',
  leaveToClass: 'opacity-0',
};

const HOVER_FILL = 'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';

/** A top-level entry's colours at rest, hovered, open (`aria-expanded`) and current. */
const ENTRY_VARIANT: Record<NavMenuVariant, string> = {
  ghost:
    'text-text hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] ' +
    'aria-expanded:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
  muted:
    'text-muted hover:text-text aria-expanded:text-text aria-[current=page]:text-text ' +
    'data-[current]:text-text',
};

const rootClass = computed(() => partClass('relative flex items-center', props.classes, 'root'));

const navClass = computed(() =>
  partClass(
    props.collapseBelow === 'always' ? '' : BAR_DISPLAY[props.collapseBelow],
    props.classes,
    'nav'
  )
);

const listClass = computed(() =>
  partClass('flex flex-wrap items-center gap-1', props.classes, 'list')
);

function itemClass(item: NavMenuItem): string {
  return partClass(
    hasPanel(item) && panelLayout(item) === 'dropdown' ? 'relative' : '',
    props.classes,
    'item'
  );
}

const TOP_LEVEL =
  'inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-md px-3 text-body font-medium ' +
  'eldra-focus';

const linkClass = computed(() =>
  partClass(cx(TOP_LEVEL, ENTRY_VARIANT[props.variant], CURRENT_PAGE), props.classes, 'link')
);

const triggerClass = computed(() =>
  partClass(
    cx(
      TOP_LEVEL,
      ENTRY_VARIANT[props.variant],
      'data-[current]:underline data-[current]:decoration-2 data-[current]:underline-offset-[0.2em]'
    ),
    props.classes,
    'trigger'
  )
);

function triggerIconClass(open: boolean): string {
  return partClass(
    cx(
      'size-4 shrink-0 transition-[rotate] duration-fast ease-out motion-reduce:transition-none',
      open && 'rotate-180'
    ),
    props.classes,
    'triggerIcon'
  );
}

function panelClass(item: NavMenuItem): string {
  return partClass(
    cx(
      'absolute top-full z-popover eldra-nav-menu-panel',
      panelLayout(item) === 'mega' ? 'inset-x-0' : 'start-0'
    ),
    props.classes,
    'panel'
  );
}

function contentClass(item: NavMenuItem): string {
  return partClass(
    cx(
      'rounded-lg border border-border bg-background text-text shadow-md animate-eldra-popover-in',
      panelLayout(item) === 'mega' ? 'p-6' : 'eldra-nav-menu-dropdown p-2'
    ),
    props.classes,
    'content'
  );
}

const footerClass = computed(() =>
  partClass(
    'mt-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border pt-4 ' +
      'empty:hidden',
    props.classes,
    'footer'
  )
);

const toggleClass = computed(() =>
  partClass(
    cx(
      'inline-flex size-10 max-md:size-11 shrink-0 cursor-pointer items-center justify-center',
      'rounded-md text-text eldra-focus',
      HOVER_FILL,
      props.collapseBelow === 'never' ? '' : TOGGLE_DISPLAY[props.collapseBelow]
    ),
    props.classes,
    'toggle'
  )
);

const toggleIconClass = computed(() => partClass('size-5', props.classes, 'toggleIcon'));

const drawerClasses = computed(() => ({
  panel: props.classes?.drawer,
  footer: props.classes?.drawerFooter,
}));

const drawerListClass = computed(() =>
  partClass('flex flex-col border-t border-border', props.classes, 'drawerList')
);

function drawerItemClass(item: NavMenuItem): string {
  return partClass(hasPanel(item) ? '' : 'border-b border-border', props.classes, 'drawerItem');
}

const drawerLinkClass = computed(() =>
  partClass(
    cx(
      'flex min-h-14 w-full items-center rounded-sm py-4',
      'text-accordion-title text-text eldra-focus',
      CURRENT_PAGE
    ),
    props.classes,
    'drawerLink'
  )
);

const accordionClasses = computed(() => ({
  summary: props.classes?.drawerTrigger,
  panel: cx('max-w-none pb-4 text-text', props.classes?.drawerPanel),
}));
</script>

<template>
  <div
    data-eldra-ui
    data-part="root"
    :class="rootClass"
    @pointerenter="onRootPointerEnter"
    @pointerleave="onRootPointerLeave"
  >
    <nav
      v-if="collapseBelow !== 'always' && entries.length > 0"
      data-part="nav"
      :class="navClass"
      :aria-label="navLabel"
      @keydown="onBarKeydown"
    >
      <ul ref="listEl" data-part="list" :class="listClass">
        <li
          v-for="{ item, index } in entries"
          :key="index"
          data-part="item"
          :class="itemClass(item)"
        >
          <template v-if="hasPanel(item)">
            <button
              :ref="(el) => (triggerEls[index] = elementOf(el))"
              type="button"
              data-part="trigger"
              :class="triggerClass"
              :aria-expanded="openIndex === index ? 'true' : 'false'"
              :aria-controls="panelId(index)"
              :data-current="containsCurrent(item) ? '' : undefined"
              @click="onTriggerClick(index)"
              @pointerenter="onTriggerPointerEnter(index, $event)"
              @pointerleave="onTriggerPointerLeave"
            >
              <span>{{ item.label }}</span>
              <!-- Tabler's `chevron-down`. -->
              <svg
                data-part="triggerIcon"
                :class="triggerIconClass(openIndex === index)"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 9l6 6l6 -6" />
              </svg>
            </button>
            <Transition v-bind="PANEL_TRANSITION">
              <div
                v-show="openIndex === index"
                :id="panelId(index)"
                :ref="(el) => (panelEls[index] = elementOf(el))"
                data-part="panel"
                :class="panelClass(item)"
                @click="onPanelClick"
              >
                <div data-part="content" :class="contentClass(item)">
                  <NavMenuPanel
                    :item="item"
                    :id-prefix="panelId(index)"
                    placement="bar"
                    :variant="variant"
                    :messages="m"
                    :link-as="linkAs"
                    :classes="classes"
                  >
                    <template v-if="slots.panelItem" #panelItem="scope">
                      <slot name="panelItem" v-bind="scope" />
                    </template>
                    <template v-if="slots.groupHeading" #groupHeading="scope">
                      <slot name="groupHeading" v-bind="scope" />
                    </template>
                  </NavMenuPanel>
                  <div v-if="slots.panelFooter" data-part="footer" :class="footerClass">
                    <slot name="panelFooter" :item="item" :index="index" :close="closePanel" />
                  </div>
                </div>
              </div>
            </Transition>
          </template>
          <component
            :is="navLinkTag(item, linkAs)"
            v-else
            data-part="link"
            :class="linkClass"
            v-bind="navLinkAttrs(item, linkAs)"
          >
            {{ item.label }}
            <VisuallyHidden v-if="item.newTab && hasHref(item)">{{
              m.opensInNewTab
            }}</VisuallyHidden>
          </component>
        </li>
      </ul>
    </nav>

    <template v-if="collapseBelow !== 'never'">
      <button
        ref="toggleEl"
        type="button"
        data-part="toggle"
        :class="toggleClass"
        :aria-label="m.navMenuOpen"
        aria-haspopup="dialog"
        :aria-expanded="drawerOpen ? 'true' : 'false'"
        :aria-controls="drawerId"
        @click="drawerOpen = true"
      >
        <slot name="toggle" :open="drawerOpen">
          <!-- Tabler's `menu-2`. -->
          <svg
            data-part="toggleIcon"
            :class="toggleIconClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M4 6l16 0" />
            <path d="M4 12l16 0" />
            <path d="M4 18l16 0" />
          </svg>
        </slot>
      </button>

      <Drawer
        :id="drawerId"
        v-model="drawerOpen"
        :side="drawerSide"
        :aria-label="m.navMenuDrawer"
        :messages="messages"
        :classes="drawerClasses"
      >
        <nav v-if="entries.length > 0" :aria-label="navLabel" @click="onDrawerClick">
          <ul data-part="drawerList" :class="drawerListClass">
            <li
              v-for="{ item, index } in entries"
              :key="index"
              data-part="drawerItem"
              :class="drawerItemClass(item)"
            >
              <AccordionItem
                v-if="hasPanel(item)"
                :title="item.label ?? ''"
                :classes="accordionClasses"
              >
                <NavMenuPanel
                  :item="item"
                  :id-prefix="`${panelId(index)}-drawer`"
                  placement="drawer"
                  :variant="variant"
                  :messages="m"
                  :link-as="linkAs"
                  :classes="classes"
                >
                  <template v-if="slots.panelItem" #panelItem="scope">
                    <slot name="panelItem" v-bind="scope" />
                  </template>
                  <template v-if="slots.groupHeading" #groupHeading="scope">
                    <slot name="groupHeading" v-bind="scope" />
                  </template>
                </NavMenuPanel>
              </AccordionItem>
              <component
                :is="navLinkTag(item, linkAs)"
                v-else
                data-part="drawerLink"
                :class="drawerLinkClass"
                v-bind="navLinkAttrs(item, linkAs)"
              >
                {{ item.label }}
                <VisuallyHidden v-if="item.newTab && hasHref(item)">{{
                  m.opensInNewTab
                }}</VisuallyHidden>
              </component>
            </li>
          </ul>
        </nav>
        <template v-if="slots.drawerFooter" #footer>
          <slot name="drawerFooter" :close="closeDrawer" />
        </template>
      </Drawer>
    </template>
  </div>
</template>
