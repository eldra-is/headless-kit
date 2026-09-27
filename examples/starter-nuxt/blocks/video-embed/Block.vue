<script setup lang="ts">
/**
 * A 16:9 video behind a poster and a real play button (spec `02-blocks.md` "Video embed",
 * 1894-1997). The provider's player — an `<iframe>` for YouTube/Vimeo, a native `<video>` for an
 * MP4 — is never mounted until the visitor activates play: before that, the frame only ever shows
 * CMS media (`poster`) or a plain `surface-strong` fill, never a provider thumbnail, so no
 * third-party request happens on page load (spec Acceptance: "No provider request … is made
 * before the visitor activates play").
 *
 * URL -> embed resolution lives in the pure sibling module `./embed.ts` (`resolveVideoEmbed`),
 * fed the result of `safeHref(videoUrl)` — never the raw field — so an unrecognised host, a
 * malformed string, or anything `safeHref` itself would already reject all collapse to the same
 * `null`, which renders `@eldrajs/ui`'s `EmptyState variant="error"` inside the frame with a link
 * back to the original URL, instead of ever building an `<iframe src>` from an arbitrary string.
 *
 * `variant`:
 *  - `contained` (default): header above, the frame fills the 64rem `content` container at
 *    `radius-xl`.
 *  - `split`: from 64rem block width, the header (5fr) sits beside the figure (7fr), 3rem gap,
 *    vertically centred; the frame stays `radius-lg` at every width. Below 64rem it stacks, same
 *    as `contained`.
 *
 * **Heading fallback.** Unlike every other rebuilt block with an `isTitle` field, `heading` here
 * is optional (`videoTitle` — a different field — is the one that's required): with no heading,
 * live rendering falls back to a `VisuallyHidden` `h2` holding `videoTitle`, so the section is
 * always labelled by *something* real (spec: "No heading: a visually hidden h2 still labels the
 * section"). While editing, an empty heading instead shows the ordinary "Add a heading"
 * `EditorPlaceholder` (matching every other block's own empty-heading hint) — `aria-labelledby`
 * follows whichever of the three actually renders, all three sharing `headingId`.
 *
 * **Icon sizing.** The disc's `player-play` icon is spec'd at 1.75rem (2rem from 48rem) with a
 * 0.2rem optical nudge — neither a standard `Icon` size (`sm`/`md`/`lg`/`xl` are 1/1.25/1.5/2rem)
 * nor an available breakpoint-conditional prop. Rendered through `EldraIcon` at the closest preset
 * (`xl`, 2rem) at every width rather than hand-rolling the SVG — the same "package preset wins"
 * trade `cta`'s banner button size and `EmptyState`'s own icon circle already document — with the
 * 0.2rem nudge kept as a literal (no matching spacing token, like `EmptyState`'s `max-w-[36ch]`).
 *
 * **Focus ring.** The spec asks for an inset ring; `app/utils/classes.ts` exports exactly one
 * `focusRing` (an outside ring, `ring-offset-background`) — see that file's own doc comment: every
 * package component now carries its own `eldra-focus`, and the one thing left for a theme to draw
 * itself (this button) gets that single recipe. Used as-is rather than reached around, documented
 * here and in the task report as the resulting visual deviation from the spec's literal geometry.
 */
import { computed, defineComponent, h, nextTick, ref, watch, type Component } from 'vue';
import {
  Container,
  EditorPlaceholder,
  EmptyState,
  Link,
  Section,
  VisuallyHidden,
} from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useEldraIcon } from '../../app/composables/useEldraIcon';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { focusRing } from '../../app/utils/classes';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { resolveVideoEmbed, type VideoEmbed } from './embed';

const props = defineProps<{ entry: EldraBlockEntry<'video-embed'> }>();
const { data, entryId } = useBlockData(props, 'video-embed');
const editing = useEditing();
const t = useT();
const headingId = `video-embed-heading-${useUiId()}`;

type Variant = 'contained' | 'split';
const variant = computed<Variant>(() => data.value.variant ?? 'contained');
const isSplit = computed(() => variant.value === 'split');

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');
const isInverted = computed(() => sectionBackground.value === 'primary');

const rawVideoUrl = computed(() => (data.value.videoUrl ?? '').trim());
const hasVideoUrl = computed(() => rawVideoUrl.value !== '');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => editing.value && !hasHeading.value);

const videoTitle = computed(() => (data.value.videoTitle ?? '').trim());
const hasVideoTitle = computed(() => videoTitle.value !== '');

/** `aria-labelledby` follows whichever of the three heading branches actually renders — see the
 * module doc comment's "Heading fallback" note. */
const sectionLabelledBy = computed(() => {
  if (hasHeading.value || showHeadingHint.value || hasVideoTitle.value) return headingId;
  return undefined;
});

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const showIntroHint = computed(() => editing.value && !hasIntro.value);
const introToneClass = computed(() => (isInverted.value ? 'text-primary-contrast' : 'text-muted'));

const durationText = computed(() => (data.value.duration ?? '').trim());

const poster = computed(() => data.value.poster ?? null);
const hasPoster = computed(() => poster.value != null);
const posterFraming = computed(() => poster.value?.framing ?? DEFAULT_IMAGE_FRAMING);

const caption = computed(() => (data.value.caption ?? '').trim());
const hasCaption = computed(() => caption.value !== '');
const captionToneClass = computed(() =>
  isInverted.value ? 'text-primary-contrast' : 'text-muted'
);

const transcriptLabel = computed(() => (data.value.transcriptLabel ?? '').trim());
const transcriptHref = computed(() => safeHref(data.value.transcriptHref));
const hasTranscript = computed(() => transcriptLabel.value !== '' && transcriptHref.value !== null);
const transcriptLinkAs = computed(() =>
  transcriptHref.value !== null && isInternalHref(transcriptHref.value)
    ? EldraRouterLink
    : undefined
);

const privacyNoteText = computed(() => data.value.privacyNote || t('video.privacyNoteDefault'));
const privacyToneClass = computed(() =>
  isInverted.value ? 'text-primary-contrast' : 'text-muted'
);

const safeVideoUrl = computed(() => safeHref(data.value.videoUrl));
/** The error state's provider link — the *original* (safe-checked) `videoUrl`, never the rewritten
 * embed `src` (spec: "a link to watch on the provider's site"). */
const providerHref = computed(() => safeVideoUrl.value);
const providerLinkAs = computed(() =>
  providerHref.value !== null && isInternalHref(providerHref.value) ? EldraRouterLink : undefined
);

const embed = computed<VideoEmbed | null>(() =>
  safeVideoUrl.value !== null ? resolveVideoEmbed(safeVideoUrl.value) : null
);
/** Only meaningful once there is a `videoUrl` at all — with none, the block shows the "paste a
 * link" editor hint instead (see the template), never the error state. */
const hasError = computed(() => hasVideoUrl.value && embed.value === null);

const activated = ref(false);
// A URL edited after activation might resolve to a different (or no longer valid) embed — drop
// back to the poster rather than leave a stale player mounted against the new value.
watch(rawVideoUrl, () => {
  activated.value = false;
});

function activate(): void {
  if (embed.value === null) return;
  activated.value = true;
}

const playerEl = ref<HTMLIFrameElement | HTMLVideoElement | null>(null);
watch(activated, (value) => {
  if (!value) return;
  void nextTick(() => {
    playerEl.value?.focus();
  });
});

/**
 * "2:14" -> "2 minutes 14 seconds", entirely from `video.minuteOne`/`minuteMany`/`secondOne`/
 * `secondMany` — never an English literal in this file (spec: duration "spoken as '2 minutes 14
 * seconds'"). A part whose count is zero is dropped (an unset minutes/seconds component reads
 * oddly spoken aloud); an unparsable `duration` yields no spoken text at all, and the play button
 * then falls back to the plain `video.play` name with no duration clause.
 */
function spokenDuration(value: string): string {
  const match = /^(\d+):([0-5]\d)$/.exec(value);
  if (!match) return '';
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const parts: string[] = [];
  if (minutes > 0) {
    parts.push(t(minutes === 1 ? 'video.minuteOne' : 'video.minuteMany', { count: minutes }));
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(t(seconds === 1 ? 'video.secondOne' : 'video.secondMany', { count: seconds }));
  }
  return parts.join(' ');
}
const spokenDurationText = computed(() => spokenDuration(durationText.value));
const playLabel = computed(() =>
  spokenDurationText.value !== ''
    ? t('video.playWithDuration', { title: videoTitle.value, duration: spokenDurationText.value })
    : t('video.play', { title: videoTitle.value })
);

/** `EditorPlaceholder.icon` (like `FeatureCard.icon`/`Badge.icon` elsewhere in this starter) takes
 * a bare, already-bound icon component, not a name — `EldraIcon` itself needs a `name` bound and
 * so can't be handed straight through. Built once at module scope, the same shape `pricing-table`'s
 * own `StarIcon` uses, fixed to the one icon the empty-`videoUrl` hint ever needs. */
const UrlHintIcon: Component = defineComponent({
  name: 'VideoEmbedUrlHintIcon',
  setup() {
    const svg = useEldraIcon('player-play');
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

const outerClass = computed(() =>
  isSplit.value
    ? 'flex flex-col gap-8 @content:grid @content:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @content:items-center @content:gap-12'
    : ''
);
const headerClass = computed(() =>
  isSplit.value ? 'flex flex-col gap-3' : 'flex flex-col gap-3 mb-8'
);
const headingClass =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] @tablet:text-h2';
const frameRadiusClass = computed(() => (isSplit.value ? 'rounded-lg' : 'rounded-xl'));
const emptyStateClasses = { root: 'absolute inset-0 h-full w-full justify-center' };
</script>

<template>
  <Section
    v-if="hasVideoUrl || editing"
    :background="sectionBackground"
    spacing="md"
    :labelled-by="sectionLabelledBy"
  >
    <Container width="content">
      <div :class="outerClass">
        <div :class="headerClass">
          <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ heading }}</h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('video.headingHintLabel')"
          />
          <VisuallyHidden v-else-if="hasVideoTitle" :id="headingId" as="h2">
            {{ videoTitle }}
          </VisuallyHidden>

          <p v-if="hasIntro" class="text-body" :class="introToneClass">
            {{ intro }}
          </p>
          <EditorPlaceholder v-else-if="showIntroHint" inline :label="t('video.introHintLabel')" />
        </div>

        <figure>
          <div class="relative aspect-[16/9] w-full overflow-hidden" :class="frameRadiusClass">
            <!-- Freshly inserted: no videoUrl yet. Only reachable while editing — the whole
                 Section is gated on `hasVideoUrl || editing` above. -->
            <EditorPlaceholder
              v-if="!hasVideoUrl"
              :icon="UrlHintIcon"
              :label="t('video.urlHintLabel')"
              :help="t('video.urlHintHelp')"
              :classes="emptyStateClasses"
            />

            <!-- An unrecognised or unsafe videoUrl: never build an <iframe>/<video> from it. -->
            <EmptyState
              v-else-if="hasError"
              variant="error"
              :title="t('video.errorTitle')"
              :text="t('video.errorText')"
              :classes="emptyStateClasses"
            >
              <template #actions>
                <Link
                  v-if="providerHref !== null"
                  :href="providerHref!"
                  :as="providerLinkAs"
                  variant="standalone"
                >
                  {{ t('video.errorLink') }}
                </Link>
              </template>
            </EmptyState>

            <!-- The ordinary poster + play control, or the activated player. -->
            <template v-else>
              <UiImage
                v-if="hasPoster"
                :src="poster!.url"
                :alt="poster!.altText ?? ''"
                :framing="posterFraming"
                :entry-id="entryId"
                field-path="poster"
                fill
              />
              <div v-else class="bg-surface-strong absolute inset-0" aria-hidden="true" />

              <button
                v-if="!activated"
                type="button"
                class="group absolute inset-0 flex h-full w-full items-center justify-center"
                :class="focusRing"
                :aria-label="playLabel"
                @click="activate"
                @keydown.enter.prevent="activate"
                @keydown.space.prevent="activate"
              >
                <span class="flex flex-col items-center gap-3" aria-hidden="true">
                  <span
                    class="bg-background text-text @tablet:size-20 duration-fast flex size-16 items-center justify-center rounded-full shadow-md transition-transform ease-out group-hover:scale-[1.06] motion-reduce:transition-none"
                  >
                    <EldraIcon name="player-play" size="xl" class="translate-x-[0.2rem]" />
                  </span>
                  <span
                    v-if="durationText"
                    class="bg-background text-text text-body-sm rounded-full px-2.5 py-1 font-semibold tabular-nums"
                  >
                    {{ durationText }}
                  </span>
                </span>
              </button>

              <iframe
                v-else-if="embed && embed.kind !== 'mp4'"
                ref="playerEl"
                :src="embed.src"
                :title="videoTitle"
                allow="fullscreen; picture-in-picture"
                tabindex="-1"
                class="absolute inset-0 h-full w-full border-0"
              />
              <video
                v-else-if="embed"
                ref="playerEl"
                :src="embed.src"
                :title="videoTitle"
                controls
                autoplay
                tabindex="-1"
                class="bg-background absolute inset-0 h-full w-full"
              />
            </template>
          </div>

          <figcaption
            v-if="hasVideoUrl && (hasCaption || hasTranscript || privacyNoteText)"
            class="@content:flex-row @content:flex-wrap @content:items-baseline @content:justify-between @content:gap-x-6 @content:gap-y-2 mt-4 flex flex-col gap-3"
          >
            <p v-if="hasCaption" class="text-body max-w-[60ch]" :class="captionToneClass">
              {{ caption }}
            </p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                v-if="hasTranscript"
                variant="standalone"
                :href="transcriptHref!"
                :as="transcriptLinkAs"
              >
                <EldraIcon name="file-text" size="sm" />
                {{ transcriptLabel }}
              </Link>
              <p v-if="privacyNoteText" class="text-body-sm" :class="privacyToneClass">
                {{ privacyNoteText }}
              </p>
            </div>
          </figcaption>
        </figure>
      </div>
    </Container>
  </Section>
</template>
