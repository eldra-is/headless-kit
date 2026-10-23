<script setup lang="ts">
import { computed, onMounted, onServerPrefetch, shallowRef, useTemplateRef, watch } from 'vue';
import { partClass } from '../../utils/cx';
import { ICON_SIZE_CLASS, ICON_STROKE_WIDTH } from '../icon/sizes';
import { cachedTablerIcon, loadTablerIcon, warnTablerIconOnce } from './registry';
import { tablerIconName } from './tablerIconName';
import type { TablerIconProps } from './types';

const props = withDefaults(defineProps<TablerIconProps>(), {
  name: undefined,
  size: 'md',
  label: undefined,
  strokeWidth: ICON_STROKE_WIDTH,
  classes: undefined,
});

const OUTLINE = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
} as const;
const FILLED = { fill: 'currentColor', stroke: 'none' } as const;

const iconName = computed(() => tablerIconName(props.name ?? ''));
const body = shallowRef(iconName.value === null ? undefined : cachedTablerIcon(iconName.value));
const root = useTemplateRef<SVGSVGElement>('root');

watch(
  () => props.name,
  (value) => {
    if (value && iconName.value === null && /[A-Za-z0-9]/.test(value)) {
      warnTablerIconOnce(value, `"${value}" is not a Tabler icon name; it renders nothing.`);
    }
  },
  { immediate: true }
);

async function load(name: string): Promise<void> {
  const loaded = await loadTablerIcon(name);
  if (iconName.value === name) body.value = loaded;
}

onServerPrefetch(async () => {
  if (iconName.value !== null && body.value === undefined) await load(iconName.value);
});

// The server stamps the name it drew; when it is this name, hydration keeps that drawing and loads nothing.
onMounted(() => {
  const drawn = root.value?.getAttribute('data-tabler-icon');
  if (iconName.value !== null && body.value === undefined && drawn !== iconName.value) {
    void load(iconName.value);
  }
});

watch(iconName, (name) => {
  if (name === null) return;
  const cached = cachedTablerIcon(name);
  body.value = cached === undefined ? '' : cached;
  if (cached === undefined) void load(name);
});

// Bound through an object, never `v-html`: Vue re-applies a `v-html` value on hydration and wipes the server's paths.
const svgAttrs = computed(() => ({
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  ...(iconName.value?.endsWith('Filled')
    ? FILLED
    : { ...OUTLINE, 'stroke-width': props.strokeWidth }),
  class: partClass(`${ICON_SIZE_CLASS[props.size]} shrink-0`, props.classes, 'root'),
  'aria-hidden': props.label === undefined ? true : undefined,
  role: props.label === undefined ? undefined : 'img',
  'aria-label': props.label,
  focusable: 'false',
  ...(body.value === undefined
    ? {}
    : { 'data-tabler-icon': iconName.value, innerHTML: body.value ?? '' }),
}));
</script>

<template>
  <svg v-if="iconName !== null" ref="root" data-eldra-ui data-part="root" v-bind="svgAttrs" />
</template>
