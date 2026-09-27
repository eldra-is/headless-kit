<script setup lang="ts">
/**
 * A single framed photo with an optional caption and link, at a chosen aspect ratio and page
 * width (spec `02-blocks.md` "Image", lines 2848-2941). No `variant` field: `width` and `aspect`
 * cover every useful combination. The block has no heading of its own, so its `Section` renders a
 * plain `<div>` (spec → Keyboard & accessibility: "not a landmark").
 *
 * **`width: 'full'`** renders no `Container` around the image itself (edge to edge, `rounded:
 * 'none'`), while the caption still sits inside a 64rem content-width column — its own `Container`,
 * rendered `as="figcaption"` so it stays a direct child of `<figure>` even though it carries the
 * width/gutter classes an ordinary `Container` does (spec → Layout, "full": "the caption sits on
 * the content grid … not against the screen edge"). Every other `width` wraps the whole figure in
 * one `Container` at that width instead, and the plain `<figcaption>` inside it inherits that same
 * column — no separate width mechanism needed there.
 *
 * **Aspect mapping.** The field's `aspect` values already use `@eldrajs/ui`'s own `ImageRatio`
 * spelling (`1x1`/`4x3`/`3x2`/`16x9`/`3x4`) for five of its six presets, but `UiImage`'s own
 * `aspect` prop still expects the slash-separated spelling every other block here passes it
 * (`'16/9'`, …) — `ASPECT_TO_UI_IMAGE` below is the one explicit translation between the two
 * vocabularies, kept local to this block rather than changing `UiImage` (which other blocks already
 * call with the slash spelling). `auto` maps to `undefined`, `UiImage`'s own default: the media's
 * native ratio, uncropped.
 *
 * **Radius** follows the spec's per-`width` table: `lg` below 48rem and `xl` from 48rem for
 * `content`/`wide` (`rounded="lg"` plus a `@tablet:rounded-xl` override on the frame part), `lg` at
 * every width for `narrow`, and no radius at all for `full`.
 *
 * **Link.** A `link` wraps the image only, never the caption (global constraints: a top-level link
 * is the `linkLabel`/`linkHref` string pair). Its accessible name comes from the image's own `alt`
 * — `Link`'s slot holds nothing else — so `linkLabel` is not rendered as visible text; it becomes
 * the link's `aria-label` only when the image is `decorative` (an empty `alt` would otherwise leave
 * the link nameless);
 * the spec's own instruction is to "write it \[the alt text\] as a destination" instead (default
 * content: "Shop the linen tea towels"-style copy lives in `alt`, not in a separate label). The
 * focus ring follows the image's own corners (`LINK_RADIUS_CLASS`, mirroring the frame's radius)
 * and sits inset for `full` width, where an outer ring would be clipped at the screen edge
 * (`focusRingInset` from `app/utils/classes.ts`). `underline: false` — an image link shows no text
 * underline.
 *
 * **No image.** The block renders nothing on the live site (spec States, "No image"). While editing
 * (`useEditing()`), a photo-icon placeholder plus a muted caption hint shows instead — spec States,
 * "Empty (freshly inserted)": "Choose an image" / format guidance, and "Add a caption (optional)"
 * below. Once an image is present, "Minimal content" (spec States) — no caption — reserves no
 * caption space at all, on the live site or in the editor alike.
 */
import { computed, defineComponent, h, type Component } from 'vue';
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import type { ImagePart } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useEldraIcon } from '../../app/composables/useEldraIcon';
import { useT } from '../../app/composables/useT';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { focusRingInset } from '../../app/utils/classes';
import { isInternalHref, safeHref } from '../../app/utils/links';

type ImageWidth = 'narrow' | 'content' | 'wide' | 'full';

const props = defineProps<{ entry: EldraBlockEntry<'image'> }>();
const { data, entryId } = useBlockData(props, 'image');
const editing = useEditing();
const t = useT();

/**
 * The freshly-inserted editor hint's photo icon (spec States, "Empty (freshly inserted)"). Same
 * shape as `pricing-table`'s own `StarIcon` / `video-embed`'s `UrlHintIcon`:
 * `EditorPlaceholder.icon` takes a bare, already-bound icon component, and `EldraIcon` needs a
 * `name` bound first. Built once at module scope so a reactive re-render never remounts — and
 * re-fetches — it.
 */
const PhotoIcon: Component = defineComponent({
  name: 'ImageHintIcon',
  setup() {
    const svg = useEldraIcon('photo');
    return () => {
      const markup = svg.value;
      if (markup === null) return h('svg', { viewBox: '0 0 24 24' });
      const body = markup.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      return h('svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        innerHTML: body,
      });
    };
  },
});

const hasImage = computed(() => Boolean(data.value.image));
const framing = computed(() => data.value.image?.framing ?? DEFAULT_IMAGE_FRAMING);
const decorative = computed(() => data.value.decorative === true);
/** Spec → Accessibility: "`decorative` → the image renders with `alt=\"\"`." `UiImage` derives its
 *  own decorative flag from an explicitly empty `alt`, so this is the only place that matters. */
const alt = computed(() => (decorative.value ? '' : (data.value.image?.altText ?? '')));

/** See the module doc comment's "Aspect mapping" section. */
const ASPECT_TO_UI_IMAGE: Record<string, string> = {
  '1x1': '1/1',
  '4x3': '4/3',
  '3x2': '3/2',
  '16x9': '16/9',
  '3x4': '3/4',
};
const aspect = computed<string | undefined>(() => {
  const value = data.value.aspect ?? '3x2';
  return value === 'auto' ? undefined : ASPECT_TO_UI_IMAGE[value];
});

const width = computed<ImageWidth>(() => (data.value.width ?? 'content') as ImageWidth);
const isFull = computed(() => width.value === 'full');

const rounded = computed<'none' | 'lg' | 'xl'>(() => (isFull.value ? 'none' : 'lg'));
/** `content`/`wide` switch to `xl` from 48rem (spec → Variants); `narrow` stays `lg` throughout,
 *  and `full` carries no radius at all, so neither needs this override. */
const frameClasses = computed<Partial<Record<ImagePart, string>> | undefined>(() =>
  width.value === 'content' || width.value === 'wide' ? { frame: '@tablet:rounded-xl' } : undefined
);

const caption = computed(() => (data.value.caption ?? '').trim());
const hasCaption = computed(() => caption.value !== '');
const captionCentered = computed(() => data.value.captionAlign === 'center');
const captionClass = computed(() => (captionCentered.value ? 'mx-auto text-center' : ''));

const linkHref = computed(() => safeHref(data.value.linkHref));
const hasLink = computed(() => Boolean(data.value.linkLabel) && linkHref.value !== null);
/** A decorative image has `alt=""`, which would leave a link around it with no accessible name at
 *  all (WCAG 2.4.4); only then does `linkLabel` step in as the link's own name. */
const linkAriaLabel = computed(() =>
  hasLink.value && alt.value === '' ? data.value.linkLabel : undefined
);
const linkAs = computed(() =>
  linkHref.value !== null && isInternalHref(linkHref.value) ? EldraRouterLink : undefined
);

/** The ring follows the image's own corners, inset for `full` (an outer ring would clip at the
 *  screen edge) — spec States, "With link". */
const LINK_RADIUS_CLASS: Record<ImageWidth, string> = {
  narrow: 'rounded-lg',
  content: 'rounded-lg @tablet:rounded-xl',
  wide: 'rounded-lg @tablet:rounded-xl',
  full: 'rounded-none',
};
const linkRootClass = computed(() =>
  isFull.value ? `${LINK_RADIUS_CLASS.full} ${focusRingInset}` : LINK_RADIUS_CLASS[width.value]
);
</script>

<template>
  <Section spacing="md">
    <template v-if="isFull">
      <figure v-if="hasImage">
        <Link
          v-if="hasLink"
          :href="linkHref!"
          :as="linkAs"
          :underline="false"
          :aria-label="linkAriaLabel"
          :classes="{ root: linkRootClass }"
        >
          <UiImage
            :src="data.image!.url"
            :alt="alt"
            :framing="framing"
            :entry-id="entryId"
            field-path="image"
            :aspect="aspect"
            rounded="none"
            class="w-full"
          />
        </Link>
        <UiImage
          v-else
          :src="data.image!.url"
          :alt="alt"
          :framing="framing"
          :entry-id="entryId"
          field-path="image"
          :aspect="aspect"
          rounded="none"
          class="w-full"
        />
        <Container v-if="hasCaption" as="figcaption" width="content" class="mt-3">
          <p class="text-body-sm text-muted max-w-[65ch]" :class="captionClass">{{ caption }}</p>
        </Container>
      </figure>
      <template v-else-if="editing">
        <EditorPlaceholder
          :icon="PhotoIcon"
          :label="t('imageBlock.hintLabel')"
          :help="t('imageBlock.hintHelp')"
          :classes="{ root: 'aspect-[3/2] w-full rounded-none' }"
        />
        <Container width="content" class="mt-3">
          <p class="text-muted text-body-sm">{{ t('imageBlock.captionHintLabel') }}</p>
        </Container>
      </template>
    </template>

    <Container v-else :width="width">
      <figure v-if="hasImage">
        <Link
          v-if="hasLink"
          :href="linkHref!"
          :as="linkAs"
          :underline="false"
          :aria-label="linkAriaLabel"
          :classes="{ root: linkRootClass }"
        >
          <UiImage
            :src="data.image!.url"
            :alt="alt"
            :framing="framing"
            :entry-id="entryId"
            field-path="image"
            :aspect="aspect"
            :rounded="rounded"
            :classes="frameClasses"
            class="w-full"
          />
        </Link>
        <UiImage
          v-else
          :src="data.image!.url"
          :alt="alt"
          :framing="framing"
          :entry-id="entryId"
          field-path="image"
          :aspect="aspect"
          :rounded="rounded"
          :classes="frameClasses"
          class="w-full"
        />
        <figcaption v-if="hasCaption" class="mt-3">
          <p class="text-body-sm text-muted max-w-[65ch]" :class="captionClass">{{ caption }}</p>
        </figcaption>
      </figure>
      <template v-else-if="editing">
        <EditorPlaceholder
          :icon="PhotoIcon"
          :label="t('imageBlock.hintLabel')"
          :help="t('imageBlock.hintHelp')"
          :classes="{ root: 'aspect-[3/2] w-full' }"
        />
        <p class="text-muted text-body-sm mt-3">{{ t('imageBlock.captionHintLabel') }}</p>
      </template>
    </Container>
  </Section>
</template>
