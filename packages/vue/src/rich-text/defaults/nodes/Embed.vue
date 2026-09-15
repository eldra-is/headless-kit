<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
import { isTrustedEmbedSource } from '@eldra-is/rich-text';
import type { NodeComponentProps } from '../../types';

defineOptions({ inheritAttrs: false });

type ScriptEmbedConfig = {
  scriptSrc: string;
  hydrate: (root: HTMLElement) => void;
};

const props = defineProps<NodeComponentProps>();
const fallthroughAttrs = useAttrs();
const embedRoot = ref<HTMLElement | null>(null);
const iframeElement = ref<HTMLIFrameElement | null>(null);
const scriptEmbedStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const measuredIframeHeight = ref<number | null>(null);

// The only origins whose posted height messages are applied to an iframe.
const TRUSTED_IFRAME_EMBED_ORIGINS = new Set(['https://embed.reddit.com']);
const MIN_EMBED_HEIGHT = 120;

const SCRIPT_EMBEDS: Record<string, ScriptEmbedConfig> = {
  x: {
    scriptSrc: 'https://platform.twitter.com/widgets.js',
    hydrate: (root) => (window as any).twttr?.widgets?.load?.(root),
  },
  instagram: {
    scriptSrc: 'https://www.instagram.com/embed.js',
    hydrate: () => (window as any).instgrm?.Embeds?.process?.(),
  },
  pinterest: {
    scriptSrc: 'https://assets.pinterest.com/js/pinit.js',
    hydrate: () => (window as any).PinUtils?.build?.(),
  },
};

const provider = computed(() =>
  typeof props.attrs.provider === 'string' ? props.attrs.provider : undefined
);
const source = computed(() =>
  isTrustedEmbedSource(props.attrs.src) ? props.attrs.src : undefined
);
const variant = computed(() =>
  typeof props.attrs.variant === 'string' ? props.attrs.variant : undefined
);
const allow = computed(() =>
  typeof props.attrs.allow === 'string' ? props.attrs.allow : undefined
);
const title = computed(() =>
  typeof props.attrs.title === 'string' ? props.attrs.title : 'Embedded content'
);
const renderMode = computed(() => (props.attrs.render === 'script' ? 'script' : 'iframe'));

const effectiveHeight = computed(
  () => measuredIframeHeight.value ?? (Number(props.attrs.height) || 360)
);

const cssWidth = computed(() => {
  const w = props.attrs.width;
  return w === '100%' ? '100%' : `${Number(w) || 640}px`;
});

const iframeContainerStyle = computed(() => [
  {
    width: cssWidth.value,
    maxWidth: '100%',
    height: `${effectiveHeight.value}px`,
    overflow: 'hidden',
  },
  fallthroughAttrs.style,
]);

const scriptContainerStyle = computed(() => [
  { width: '100%', maxWidth: props.attrs.width ? `${Number(props.attrs.width)}px` : 'fit-content' },
  fallthroughAttrs.style,
]);

const placeholderStyle = computed(() => ({
  width: props.attrs.width ? `${props.attrs.width}px` : '20rem',
  height: props.attrs.height ? `${props.attrs.height}px` : '10rem',
  maxWidth: '100%',
}));

const parsePostedHeight = (raw: unknown): number | null => {
  if (typeof raw !== 'string') return null;
  try {
    const height = JSON.parse(raw)?.data;
    if (typeof height !== 'number' || !Number.isFinite(height)) return null;
    return Math.max(MIN_EMBED_HEIGHT, height);
  } catch {
    return null;
  }
};

const handleIframeResizeMessage = (event: MessageEvent) => {
  if (renderMode.value !== 'iframe' || !TRUSTED_IFRAME_EMBED_ORIGINS.has(event.origin)) return;
  if (event.source !== iframeElement.value?.contentWindow) return;
  const nextHeight = parsePostedHeight(event.data);
  if (nextHeight === null) return;
  measuredIframeHeight.value = nextHeight;
};

const ensureScript = (src: string) => {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Cannot load embed scripts without a document.'));
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[data-embed-script="${src}"]`);
  if (existing) return Promise.resolve(existing);

  return new Promise<HTMLScriptElement>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = src;
    script.dataset.embedScript = src;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Failed to load embed script: ${src}`));
    document.body.append(script);
  });
};

const initializeScriptEmbed = async () => {
  if (!embedRoot.value || renderMode.value !== 'script' || !provider.value || !source.value) return;
  const config = SCRIPT_EMBEDS[provider.value];
  if (!config) {
    scriptEmbedStatus.value = 'error';
    return;
  }
  scriptEmbedStatus.value = 'loading';
  try {
    await ensureScript(config.scriptSrc);
    scriptEmbedStatus.value = 'ready';
    await nextTick();
    config.hydrate(embedRoot.value);
  } catch {
    scriptEmbedStatus.value = 'error';
  }
};

watch(
  () => source.value,
  () => {
    measuredIframeHeight.value = null;
  }
);

watch(
  () => [provider.value, source.value, variant.value, renderMode.value],
  async () => {
    await nextTick();
    await initializeScriptEmbed();
  },
  { flush: 'post' }
);

onMounted(async () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('message', handleIframeResizeMessage);
  await nextTick();
  await initializeScriptEmbed();
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('message', handleIframeResizeMessage);
});
</script>

<template>
  <div
    v-if="source && renderMode === 'iframe'"
    ref="embedRoot"
    data-embed
    :data-embed-provider="provider || undefined"
    :class="fallthroughAttrs.class"
    :style="iframeContainerStyle"
  >
    <iframe
      ref="iframeElement"
      :src="source"
      :width="props.attrs.width || undefined"
      :height="props.attrs.height || undefined"
      :style="{ display: 'block', width: '100%', height: `${effectiveHeight}px`, border: 0 }"
      :allow="allow"
      :title="title"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
    />
  </div>

  <div
    v-else-if="source && renderMode === 'script'"
    ref="embedRoot"
    data-embed
    :data-embed-provider="provider || undefined"
    :class="fallthroughAttrs.class"
    :style="scriptContainerStyle"
  >
    <div
      v-if="scriptEmbedStatus === 'idle' || scriptEmbedStatus === 'loading'"
      data-embed-placeholder
      aria-hidden="true"
      :style="placeholderStyle"
    />
    <div v-else-if="scriptEmbedStatus === 'error'">
      <a :href="source" rel="noopener noreferrer" target="_blank">{{ title }}</a>
    </div>
    <div v-show="scriptEmbedStatus === 'ready'">
      <blockquote
        v-if="provider === 'x'"
        class="twitter-tweet"
        data-dnt="true"
        :style="{
          margin: 0,
          maxWidth: props.attrs.width ? `${props.attrs.width}px` : '100%',
          width: '100%',
        }"
      >
        <a :href="source">View post on X</a>
      </blockquote>

      <blockquote
        v-else-if="provider === 'instagram'"
        class="instagram-media"
        :data-instgrm-permalink="source"
        data-instgrm-version="14"
        :style="{
          margin: 0,
          maxWidth: props.attrs.width ? `${props.attrs.width}px` : '100%',
          width: '100%',
        }"
      >
        <a :href="source">View on Instagram</a>
      </blockquote>

      <a
        v-else-if="provider === 'pinterest' && variant"
        :data-pin-do="'embed' + variant.charAt(0).toUpperCase() + variant.slice(1)"
        :data-pin-board-width="props.attrs.width || 400"
        data-pin-scale-height="320"
        data-pin-scale-width="80"
        :href="source"
      />
    </div>
  </div>
</template>
