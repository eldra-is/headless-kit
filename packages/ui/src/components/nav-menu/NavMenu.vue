<script setup lang="ts">
import {
  computed,
  nextTick,
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
import { useUiId } from '../../utils/id';
import Drawer from '../drawer/Drawer.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import NavMenuDrawerList from './NavMenuDrawerList.vue';
import NavMenuPanel from './NavMenuPanel.vue';
import { useNavMenuKeys } from './navMenuKeys';
import {
  CURRENT_PAGE,
  currentEntry,
  currentMark,
  hasHref,
  hasPanel,
  isRenderableLink,
  navLinkAttrs,
  navLinkTag,
  panelLayout,
} from './navLinks';
import type {
  NavMenuCollapse,
  NavMenuGroupHeadingSlotProps,
  NavMenuItem,
  NavMenuPanelItemSlotProps,
  NavMenuProps,
  NavMenuVariant,
} from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<NavMenuProps>(), {
  variant: 'ghost',
  modelValue: undefined,
  drawerOpen: undefined,
  ariaLabel: undefined,
  collapseBelow: 'lg',
  drawerSide: 'left',
  drawerLayout: 'accordion',
  drawerMode: 'sheet',
  drawerItems: undefined,
  openOnHover: false,
  linkAs: undefined,
  cardAspect: undefined,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [index: number | null];
  'update:drawerOpen': [open: boolean];
}>();

defineSlots<{
  /** The inside of one panel entry, in the bar or the drawer; the link around it stays the menu's. */
  panelItem?: (props: NavMenuPanelItemSlotProps) => unknown;
  /** A column heading's text, in the bar or the drawer. */
  groupHeading?: (props: NavMenuGroupHeadingSlotProps) => unknown;
  /** Extra content at the foot of every panel. */
  panelFooter?: (props: { item: NavMenuItem; index: number; close: () => void }) => unknown;
  /** A panel button's icon, replacing the chevron; it turns over while the panel is open. */
  triggerIcon?: (props: { item: NavMenuItem; open: boolean }) => unknown;
  /** The menu button's inside, replacing the icon. */
  toggle?: (props: { open: boolean }) => unknown;
  /** The drawer's header row, before its close button: a logo, a call to action. The sheet only. */
  drawerHeader?: (props: { close: () => void }) => unknown;
  /** The drawer's footer: fixed in the sheet, after the entries in the inline drawer. */
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

function renderableEntries(items: readonly NavMenuItem[]): { item: NavMenuItem; index: number }[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter((entry) => isRenderableLink(entry.item));
}

const entries = computed(() => renderableEntries(props.items));
/** The single top-level entry marked as holding the current page (`currentEntry`). */
const markedEntry = computed(() => currentEntry(entries.value.map(({ item }) => item)));
const drawerEntries = computed(() => renderableEntries(props.drawerItems ?? props.items));

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

const inline = computed(() => props.drawerMode === 'inline');

// A drawer left open while the screen widens past collapseBelow: a modal one keeps the now visible
// bar inert, an inline one would hang open under a bar that has no Close button any more.
const toggleEl = ref<HTMLButtonElement | null>(null);
const inlineEl = ref<HTMLElement | null>(null);

/**
 * Where the inline drawer's top edge sits in the window, so it can fill the rest of it and scroll
 * on its own: measured when it opens and on every resize while it is open.
 */
const inlineTop = ref(0);

function measureInline(): void {
  const el = inlineEl.value;
  if (!el) return;
  // From layout positions, not the drawer's own box: while it enters it is shifted up a little, and
  // measuring that would leave it as much too tall, its foot below the window.
  const parent = el.offsetParent;
  const top =
    parent instanceof Element === false
      ? el.getBoundingClientRect().top
      : parent.getBoundingClientRect().top + parent.clientTop + el.offsetTop;
  inlineTop.value = Math.max(0, top);
}

function onResizeWhileOpen(): void {
  if (toggleEl.value && getComputedStyle(toggleEl.value).display === 'none') {
    closeDrawer();
    return;
  }
  if (inline.value) measureInline();
}

watch(
  drawerOpen,
  (open) => {
    if (typeof window === 'undefined') return;
    if (open) {
      window.addEventListener('resize', onResizeWhileOpen);
      if (inline.value) void nextTick(measureInline);
    } else window.removeEventListener('resize', onResizeWhileOpen);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearHoverTimers();
  window.removeEventListener('resize', onResizeWhileOpen);
});

/**
 * The inline drawer is a disclosure, not a dialog: no focus trap and no inert page. It closes the
 * way the bar's panels do — `Escape` (focus back on the menu button), a press outside it, or focus
 * leaving it — so focus can never walk on into the page it covers.
 */
useOverlay({
  open: computed(() => inline.value && drawerOpen.value),
  trigger: toggleEl,
  content: inlineEl,
  setOpen: (next) => {
    if (!next) closeDrawer();
  },
});

function onToggleClick(): void {
  // The sheet covers its own button, so the button only ever opens it; the inline drawer's button
  // stays in view and closes it again.
  drawerOpen.value = inline.value ? !drawerOpen.value : true;
}

const toggleLabel = computed(() =>
  inline.value && drawerOpen.value ? m.value.close : m.value.navMenuOpen
);

/** Closes the open panel and the drawer, for a router's navigation hook. */
function close(): void {
  closePanel();
  closeDrawer();
}

defineExpose({ close });

// Static strings, so Tailwind's source scan sees every variant.
const BAR_DISPLAY: Record<Exclude<NavMenuCollapse, 'always'>, string> = {
  md: 'eldra:hidden eldra:md:block',
  lg: 'eldra:hidden eldra:lg:block',
  xl: 'eldra:hidden eldra:xl:block',
  '@tablet': 'eldra:hidden eldra:@tablet:block',
  '@content': 'eldra:hidden eldra:@content:block',
  '@wide': 'eldra:hidden eldra:@wide:block',
  never: 'eldra:block',
};
const TOGGLE_DISPLAY: Record<Exclude<NavMenuCollapse, 'never'>, string> = {
  md: 'eldra:md:hidden',
  lg: 'eldra:lg:hidden',
  xl: 'eldra:xl:hidden',
  '@tablet': 'eldra:@tablet:hidden',
  '@content': 'eldra:@content:hidden',
  '@wide': 'eldra:@wide:hidden',
  always: '',
};

const PANEL_TRANSITION = {
  enterFromClass: '',
  enterActiveClass: '',
  enterToClass: '',
  leaveFromClass: '',
  leaveActiveClass:
    'eldra:pointer-events-none eldra:transition-opacity eldra:duration-fast eldra:ease-in',
  leaveToClass: 'eldra:opacity-0',
};

/**
 * The inline drawer fades in as it settles 0.25rem down into place, and fades back up a little
 * faster as it closes. Its resting state is fully shown, so only the hidden end carries classes: a
 * class for the shown end as well would sit beside the hidden one for a frame, and whichever the
 * stylesheet orders last would win. The durations are tokens, which the reduced-motion rule zeroes.
 */
const INLINE_TRANSITION = {
  enterFromClass: 'eldra:opacity-0 eldra:-translate-y-1',
  enterActiveClass: 'eldra:transition-[opacity,translate] eldra:duration-base eldra:ease-out',
  enterToClass: '',
  leaveFromClass: '',
  leaveActiveClass:
    'eldra:pointer-events-none eldra:transition-[opacity,translate] eldra:duration-fast eldra:ease-in',
  leaveToClass: 'eldra:opacity-0 eldra:-translate-y-1',
};

const HOVER_FILL = 'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';

/** A top-level entry's colours at rest, hovered, open (`aria-expanded`) and current. */
const ENTRY_VARIANT: Record<NavMenuVariant, string> = {
  ghost:
    'eldra:text-text eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] ' +
    'eldra:aria-expanded:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
  muted:
    'eldra:text-muted eldra:hover:text-text eldra:aria-expanded:text-text eldra:aria-[current=page]:text-text ' +
    'eldra:data-[current]:text-text',
};

/** An entry marked `tone: 'accent'` (a "Sale" link): the accent colour in every state. */
const ENTRY_ACCENT: Record<NavMenuVariant, string> = {
  ghost:
    'eldra:text-accent eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] ' +
    'eldra:aria-expanded:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
  muted: 'eldra:text-accent',
};

function entryColours(item: NavMenuItem): string {
  return (item.tone === 'accent' ? ENTRY_ACCENT : ENTRY_VARIANT)[props.variant];
}

const ROOT = 'eldra:relative eldra:flex eldra:items-center';

const navClass = computed(() => [
  props.collapseBelow === 'always' ? '' : BAR_DISPLAY[props.collapseBelow],
  props.classes?.nav,
]);

const listClass = computed(() => [
  'eldra:flex eldra:flex-wrap eldra:items-center eldra:gap-1',
  props.classes?.list,
]);

function itemClass(item: NavMenuItem) {
  return [
    hasPanel(item) && panelLayout(item) === 'dropdown' ? 'eldra:relative' : '',
    props.classes?.item,
  ];
}

const TOP_LEVEL =
  'eldra:inline-flex eldra:min-h-10 eldra:cursor-pointer eldra:items-center eldra:gap-1 eldra:rounded-md eldra:px-3 eldra:text-body eldra:font-medium ' +
  'eldra:eldra-focus';

function linkClass(item: NavMenuItem) {
  return [[TOP_LEVEL, entryColours(item), CURRENT_PAGE], props.classes?.link];
}

function triggerClass(item: NavMenuItem) {
  return [
    [
      TOP_LEVEL,
      entryColours(item),
      'eldra:data-[current]:underline eldra:data-[current]:decoration-2 eldra:data-[current]:underline-offset-[0.2em]',
    ],
    props.classes?.trigger,
  ];
}

function triggerIconClass(open: boolean) {
  return [
    [
      'eldra:inline-flex eldra:size-4 eldra:shrink-0 eldra:items-center eldra:justify-center',
      'eldra:transition-[rotate] eldra:duration-fast eldra:ease-out eldra:motion-reduce:transition-none',
      open && 'eldra:rotate-180',
    ],
    props.classes?.triggerIcon,
  ];
}

function panelClass(item: NavMenuItem) {
  return [
    [
      'eldra:absolute eldra:top-full eldra:z-popover eldra:eldra-nav-menu-panel',
      panelLayout(item) === 'mega' ? 'eldra:inset-x-0' : 'eldra:start-0',
    ],
    props.classes?.panel,
  ];
}

function contentClass(item: NavMenuItem) {
  return [
    [
      // Every panel fades in and settles into place, a mega sheet and a dropdown alike.
      'eldra:rounded-lg eldra:border eldra:border-border eldra:bg-background eldra:text-text eldra:shadow-md eldra:animate-eldra-menu-in',
      panelLayout(item) === 'mega' ? 'eldra:p-6' : 'eldra:eldra-nav-menu-dropdown eldra:p-2',
    ],
    props.classes?.content,
  ];
}

const footerClass = computed(() => [
  'eldra:mt-4 eldra:flex eldra:flex-wrap eldra:items-center eldra:justify-between eldra:gap-x-8 eldra:gap-y-3 eldra:border-t eldra:border-border eldra:pt-4 ' +
    'eldra:empty:hidden',
  props.classes?.footer,
]);

const toggleClass = computed(() => [
  [
    'eldra:inline-flex eldra:size-10 eldra:max-md:size-11 eldra:shrink-0 eldra:cursor-pointer eldra:items-center eldra:justify-center',
    'eldra:rounded-md eldra:text-text eldra:eldra-focus',
    HOVER_FILL,
    props.collapseBelow === 'never' ? '' : TOGGLE_DISPLAY[props.collapseBelow],
  ],
  props.classes?.toggle,
]);

const toggleIconClass = computed(() => ['eldra:size-5', props.classes?.toggleIcon]);

/**
 * The inline drawer hangs from the menu's positioning box, as a mega panel does (make the root
 * `static` to hang it from a whole header), and fills the window below its own top edge.
 */
const inlineClass = computed(() => [
  [
    'eldra:absolute eldra:inset-x-0 eldra:top-full eldra:z-popover eldra:flex eldra:flex-col',
    'eldra:h-[calc(100dvh-var(--eldra-nav-menu-drawer-top,0px))] eldra:overflow-y-auto eldra:overscroll-contain',
    'eldra:border-t eldra:border-border eldra:bg-background eldra:text-text',
  ],
  props.classes?.drawer,
]);
const inlineStyle = computed(() => ({ '--eldra-nav-menu-drawer-top': `${inlineTop.value}px` }));
const inlineBodyClass = computed(() => ['eldra:shrink-0', props.classes?.drawerBody]);
/**
 * The foot sits at the bottom of the window when the entries are shorter than it (`mt-auto` in the
 * drawer's column, which is `100dvh` tall, so it rises with a phone's browser toolbars), and after
 * the last entry once they are longer. Its bottom padding adds the device's safe area, as the sheet's
 * footer does.
 */
const inlineFooterClass = computed(() => [
  'eldra:mt-auto eldra:flex eldra:shrink-0 eldra:flex-col eldra:gap-3 eldra:bg-surface eldra:px-4 eldra:pt-4 eldra:eldra-drawer-footer-bottom',
  props.classes?.drawerFooter,
]);

const drawerClasses = computed(() => ({
  panel: props.classes?.drawer,
  header: props.classes?.drawerHeader,
  close: props.classes?.drawerClose,
  body: props.classes?.drawerBody,
  footer: props.classes?.drawerFooter,
}));
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="ROOT"
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
              :data-tone="item.tone"
              :class="triggerClass(item)"
              :aria-expanded="openIndex === index ? 'true' : 'false'"
              :aria-controls="panelId(index)"
              :data-current="item === markedEntry ? '' : undefined"
              :aria-current="currentMark(item.current)"
              @click="onTriggerClick(index)"
              @pointerenter="onTriggerPointerEnter(index, $event)"
              @pointerleave="onTriggerPointerLeave"
            >
              <span>{{ item.label }}</span>
              <span
                :data-eldra-slot="eldra.slotHost('triggerIcon')"
                data-part="triggerIcon"
                :class="triggerIconClass(openIndex === index)"
                aria-hidden="true"
              >
                <slot name="triggerIcon" :item="item" :open="openIndex === index">
                  <!-- Tabler's `chevron-down`. -->
                  <svg
                    class="eldra:size-full"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    focusable="false"
                  >
                    <path d="M6 9l6 6l6 -6" />
                  </svg>
                </slot>
              </span>
            </button>
            <Transition v-bind="PANEL_TRANSITION">
              <div
                v-show="openIndex === index"
                :id="panelId(index)"
                :ref="(el) => (panelEls[index] = elementOf(el))"
                data-part="panel"
                :data-layout="panelLayout(item)"
                :class="panelClass(item)"
                @click="onPanelClick"
              >
                <div
                  data-part="content"
                  :data-layout="panelLayout(item)"
                  :class="contentClass(item)"
                >
                  <NavMenuPanel
                    :item="item"
                    :id-prefix="panelId(index)"
                    placement="bar"
                    :variant="variant"
                    :messages="m"
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
                  <div
                    v-if="slots.panelFooter"
                    :data-eldra-slot="eldra.slotHost('panelFooter')"
                    data-part="footer"
                    :class="footerClass"
                  >
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
            :data-tone="item.tone"
            :class="linkClass(item)"
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
        :data-eldra-slot="eldra.slotHost('toggle')"
        type="button"
        data-part="toggle"
        :class="toggleClass"
        :aria-label="toggleLabel"
        :aria-haspopup="inline ? undefined : 'dialog'"
        :aria-expanded="drawerOpen ? 'true' : 'false'"
        :aria-controls="drawerId"
        @click="onToggleClick"
      >
        <slot name="toggle" :open="drawerOpen">
          <!-- Tabler's `x`, on the inline drawer's open button. -->
          <svg
            v-if="inline && drawerOpen"
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
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </svg>
          <!-- Tabler's `menu-2`. -->
          <svg
            v-else
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

      <Transition v-if="inline" v-bind="INLINE_TRANSITION">
        <div
          v-show="drawerOpen"
          :id="drawerId"
          ref="inlineEl"
          data-part="drawer"
          :class="inlineClass"
          :style="inlineStyle"
        >
          <div data-part="drawerBody" :class="inlineBodyClass">
            <NavMenuDrawerList
              :entries="drawerEntries"
              :layout="drawerLayout"
              :panel-id="panelId"
              :nav-label="navLabel"
              :variant="variant"
              :messages="m"
              :link-as="linkAs"
              :card-aspect="cardAspect"
              :classes="classes"
              @follow="closeDrawer"
            >
              <template v-if="slots.panelItem" #panelItem="scope">
                <slot name="panelItem" v-bind="scope" />
              </template>
              <template v-if="slots.groupHeading" #groupHeading="scope">
                <slot name="groupHeading" v-bind="scope" />
              </template>
            </NavMenuDrawerList>
          </div>
          <div
            v-if="slots.drawerFooter"
            :data-eldra-slot="eldra.slotHost('drawerFooter')"
            data-part="drawerFooter"
            :class="inlineFooterClass"
          >
            <slot name="drawerFooter" :close="closeDrawer" />
          </div>
        </div>
      </Transition>

      <Drawer
        v-else
        :id="drawerId"
        v-model="drawerOpen"
        :side="drawerSide"
        :aria-label="m.navMenuDrawer"
        :messages="messages"
        :class="classes?.drawerRoot"
        :classes="drawerClasses"
      >
        <template v-if="slots.drawerHeader" #header>
          <slot name="drawerHeader" :close="closeDrawer" />
        </template>
        <NavMenuDrawerList
          :entries="drawerEntries"
          :layout="drawerLayout"
          :panel-id="panelId"
          :nav-label="navLabel"
          :variant="variant"
          :messages="m"
          :link-as="linkAs"
          :card-aspect="cardAspect"
          :classes="classes"
          @follow="closeDrawer"
        >
          <template v-if="slots.panelItem" #panelItem="scope">
            <slot name="panelItem" v-bind="scope" />
          </template>
          <template v-if="slots.groupHeading" #groupHeading="scope">
            <slot name="groupHeading" v-bind="scope" />
          </template>
        </NavMenuDrawerList>
        <template v-if="slots.drawerFooter" #footer>
          <slot name="drawerFooter" :close="closeDrawer" />
        </template>
      </Drawer>
    </template>
  </div>
</template>
