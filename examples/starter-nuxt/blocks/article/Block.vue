<script setup lang="ts">
/**
 * A journal post: a centred header (category · date · reading time, title, dek, byline), a cover
 * image, a rich-text body in a narrow column and an author card at the end (spec `02-blocks.md`
 * "Article", 2400–2597). No `variant` — every journal post reads the same.
 *
 * **Two containers, one axis.** The header and cover follow the 64rem `content` container; the
 * body and author card follow the 40rem `narrow` container — both `mx-auto`, so they share the
 * same centre line even though only one of them is capped at 40rem (spec → Layout: "the body and
 * author card follow the 40rem narrow container, centred on the same axis as the header").
 *
 * **The date.** `formatDate` (`@eldrajs/ui`) is the package's one, frozen date formatter —
 * `{ day: 'numeric', month: 'short', year: 'numeric' }`, with no options parameter to ask for a
 * different month style. The design calls for two renderings at this block's own width (a long
 * month from 48rem, a short one below), but there is no way to get a second, longer-month string
 * out of this function without either hand-formatting the date locally (bypassing the package's
 * own never-throws date handling) or patching a published, frozen component — both against this
 * project's rules. So the block renders the one, real string `formatDate` produces for the
 * content locale, once, at every width, rather than two copies of dead identical markup toggled
 * by a container query that would have nothing to actually toggle.
 *
 * **The byline's embedded link.** `article.byline` is one template string ("By {name}"), the same
 * shape as `footer.socialLinkName`, but the name inside it has to be its own `<Link>` — the
 * translated string itself carries no markup. `bylineParts` interpolates the template once, then
 * splits the *result* around the literal name text that was just substituted into it, so the
 * surrounding words (translated, locale-appropriate) render as plain text on either side of a real
 * anchor wrapping only the name.
 *
 * **The inline rich-text image/embed.** `EldraRichText`'s renderer (`theme-core`'s
 * `richTextTree.ts`) does not wrap an `image` node in a `<figure>`/`<figcaption>` yet, and renders
 * an `embed` node as an inert, un-hydrated `<div class="eldra-embed">` rather than a live
 * `<iframe>` (`app/assets/main.css`'s own comment on `.eldra-embed` documents both gaps as
 * forward-compatible, not yet implemented). Both are simply what the frozen renderer emits for
 * `mock.json`'s body doc; this block does not compensate for either.
 */
import { computed, ref } from 'vue';
import { Avatar, Container, EditorPlaceholder, Link, Section, formatDate } from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING, EldraRichText, useEldra } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'article'> }>();
const { data, entryId } = useBlockData(props, 'article');
const editing = useEditing();
const t = useT();
const titleId = `article-title-${useUiId()}`;

/** Same "no provider, fall back" shape as `useT.ts`/`useEditing.ts`'s own local helpers — a plain
 *  `mount()` outside a themed page throws with no `provideEldra()` ancestor. */
function tryUseEldra(): ReturnType<typeof useEldra> | undefined {
  try {
    return useEldra();
  } catch {
    return undefined;
  }
}
/** The content locale `formatDate` renders the date in — the same source `useT()` reads for its
 *  own locale lookup, exposed here because `formatDate` needs the raw string, not a translation. */
const locale = computed(() => tryUseEldra()?.preview.locale ?? 'en-US');

const title = computed(() => (data.value.title ?? '').trim());
const hasTitle = computed(() => title.value !== '');

const dek = computed(() => (data.value.dek ?? '').trim());
const hasDek = computed(() => dek.value !== '');

const categoryLabel = computed(() => (data.value.categoryLabel ?? '').trim());
const categoryHref = computed(() => safeHref(data.value.categoryHref));
const hasCategory = computed(() => categoryLabel.value !== '' && categoryHref.value !== null);
const categoryLinkAs = computed(() =>
  categoryHref.value !== null && isInternalHref(categoryHref.value) ? EldraRouterLink : undefined
);

/** Never throws (`@eldrajs/ui`'s own `formatDate`); a malformed/empty `publishedAt` renders no
 *  `<time>` at all rather than a fabricated date — see the module doc comment for why there is
 *  only ever the one rendering, not two. */
const formattedDate = computed(() =>
  data.value.publishedAt ? formatDate(data.value.publishedAt, locale.value) : null
);
const hasDate = computed(() => formattedDate.value !== null);

const readingTime = computed(() => (data.value.readingTime ?? '').trim());
const hasReadingTime = computed(() => readingTime.value !== '');

const hasMetaLine = computed(() => hasCategory.value || hasDate.value || hasReadingTime.value);
const showMetaHint = computed(() => editing.value && !hasMetaLine.value);

const coverImage = computed(() => data.value.coverImage ?? null);
const hasCoverImage = computed(() => coverImage.value !== null);
const coverFraming = computed(() => coverImage.value?.framing ?? DEFAULT_IMAGE_FRAMING);
const coverCaption = computed(() => (data.value.coverCaption ?? '').trim());
const showCoverHint = computed(() => editing.value && !hasCoverImage.value);

const hasBody = computed(
  () => Array.isArray(data.value.body?.content) && data.value.body!.content!.length > 0
);
const showBodyHint = computed(() => editing.value && !hasBody.value);

const authorName = computed(() => (data.value.authorName ?? '').trim());
const hasAuthorName = computed(() => authorName.value !== '');
const authorRole = computed(() => (data.value.authorRole ?? '').trim());
const authorBio = computed(() => (data.value.authorBio ?? '').trim());
const authorAvatarUrl = computed(() => data.value.authorAvatar?.url);
const authorLinkLabel = computed(() => (data.value.authorLinkLabel ?? '').trim());
const authorLinkHref = computed(() => safeHref(data.value.authorLinkHref));
const hasAuthorLink = computed(() => authorLinkLabel.value !== '' && authorLinkHref.value !== null);
const authorLinkAs = computed(() =>
  authorLinkHref.value !== null && isInternalHref(authorLinkHref.value)
    ? EldraRouterLink
    : undefined
);

/** Spec → Field table, `showByline`: "Adds the small byline to the header" — a byline with no
 *  author name would have nothing to say, so this also requires one. */
const showByline = computed(() => (data.value.showByline ?? true) && hasAuthorName.value);
/** See the module doc comment: interpolate once, then split the result around the literal name
 *  text so only the name renders inside a real `<Link>`. */
const bylineText = computed(() => t('article.byline', { name: authorName.value }));
const bylineParts = computed(() => {
  const text = bylineText.value;
  const index = text.indexOf(authorName.value);
  if (index === -1) return { before: text, after: '' };
  return { before: text.slice(0, index), after: text.slice(index + authorName.value.length) };
});
const bylineRoleSuffix = computed(() => (authorRole.value !== '' ? `, ${authorRole.value}` : ''));

/** Spec → States, "No author avatar"/field table: the author card renders once *any* author field
 *  carries something, not only once every one of them does. */
const hasAuthorCard = computed(
  () =>
    hasAuthorName.value ||
    authorRole.value !== '' ||
    authorBio.value !== '' ||
    Boolean(authorAvatarUrl.value) ||
    hasAuthorLink.value
);
const showAuthorHint = computed(() => editing.value && !hasAuthorCard.value);

/** See `faq`/`split-content`'s own identical call: one ref around the rendered `EldraRichText`
 *  root covers every table/code block it produces. */
const richTextRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(richTextRoot, (caption) => caption ?? t('article.richTextTableLabel'));
</script>

<template>
  <Section spacing="md">
    <article :aria-labelledby="hasTitle ? titleId : undefined">
      <Container width="content">
        <header class="mx-auto flex max-w-[46rem] flex-col items-center gap-4 text-center">
          <div
            v-if="hasMetaLine"
            class="text-muted flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm"
          >
            <Link
              v-if="hasCategory"
              :href="categoryHref!"
              :as="categoryLinkAs"
              :classes="{ root: 'target-min text-accent inline-flex items-center font-semibold' }"
            >
              {{ categoryLabel }}
            </Link>
            <span v-if="hasCategory && (hasDate || hasReadingTime)" aria-hidden="true">·</span>
            <time v-if="hasDate" :datetime="data.publishedAt">{{ formattedDate }}</time>
            <span v-if="hasDate && hasReadingTime" aria-hidden="true">·</span>
            <span v-if="hasReadingTime">{{ readingTime }}</span>
          </div>
          <EditorPlaceholder v-else-if="showMetaHint" inline :label="t('article.metaHintLabel')" />

          <h1
            v-if="hasTitle"
            :id="titleId"
            class="@tablet:text-[2.75rem] text-[2.125rem] leading-[1.1] font-bold text-balance"
          >
            {{ title }}
          </h1>
          <EditorPlaceholder
            v-else-if="editing"
            :id="titleId"
            inline
            :label="t('article.titleHintLabel')"
          />

          <p v-if="hasDek" class="text-muted max-w-[38rem] text-lg leading-[1.55]">{{ dek }}</p>
          <EditorPlaceholder v-else-if="editing" inline :label="t('article.dekHintLabel')" />

          <div v-if="showByline" class="text-muted flex items-center gap-2 text-sm">
            <Avatar :src="authorAvatarUrl" :name="authorName" size="sm" decorative />
            <span>
              {{ bylineParts.before
              }}<Link
                v-if="hasAuthorLink"
                :href="authorLinkHref!"
                :as="authorLinkAs"
                :classes="{ root: 'font-semibold' }"
                >{{ authorName }}</Link
              ><template v-else>{{ authorName }}</template
              >{{ bylineRoleSuffix }}{{ bylineParts.after }}
            </span>
          </div>
        </header>

        <figure v-if="hasCoverImage" class="@tablet:mt-12 mt-8">
          <UiImage
            :src="coverImage!.url"
            :alt="coverImage!.altText ?? ''"
            :framing="coverFraming"
            :entry-id="entryId"
            field-path="coverImage"
            rounded="lg"
            :classes="{
              frame: 'aspect-[4/3]! @tablet:aspect-[16/9]! @tablet:rounded-xl!',
            }"
            class="w-full"
          />
          <figcaption v-if="coverCaption" class="text-muted mt-3 text-sm">
            {{ coverCaption }}
          </figcaption>
        </figure>
        <EditorPlaceholder
          v-else-if="showCoverHint"
          inline
          class="@tablet:mt-12 mt-8"
          :label="t('article.coverHintLabel')"
          :help="t('article.coverHintHelp')"
          :classes="{ root: 'aspect-[4/3] w-full @tablet:aspect-[16/9]' }"
        />
      </Container>

      <Container width="narrow" class="@tablet:mt-12 mt-8">
        <div ref="richTextRoot">
          <EldraRichText
            v-if="hasBody"
            class="prose-eldra"
            :entry-id="entryId"
            field="body"
            :doc="data.body"
            api-id="article"
          />
          <EditorPlaceholder
            v-else-if="showBodyHint"
            inline
            :label="t('article.bodyHintLabel')"
            :help="t('article.bodyHintHelp')"
          />
        </div>

        <footer
          v-if="hasAuthorCard"
          class="border-border mt-12 flex items-start gap-4 border-t pt-8 text-sm leading-[1.6]"
        >
          <Avatar :src="authorAvatarUrl" :name="authorName" size="lg" decorative />
          <!--
            Spec → Layout, "Author card": "Text at 0.875rem, line height 1.6, 0.25rem apart:
            name …, role …, bio (0.5rem above), link …" — every pair is 0.25rem apart except bio,
            which sits 0.5rem below whatever precedes it. A single flex column with one uniform
            `gap-*` cannot express that one exception without an extra `margin-top` stacked on top
            of the gap (the previous shape here: a `gap-1` container plus `mt-2` on `bio` and
            `mt-1` on the link — margin and `gap` both contribute space in a flex layout, so they
            summed to 0.75rem before `bio` and 0.5rem before the link, both wrong). Two nested
            `flex-col` groups reproduce the exact numbers with `gap` alone and no margin: the outer
            `gap-2` (0.5rem) is the space between the name/role group and the bio/link group — the
            one exceptional boundary — and each inner `gap-1` (0.25rem) covers the two ordinary
            pairs (name↔role, bio↔link). Either group is only rendered when it has content, so an
            absent name+role (or bio+link) never contributes an empty, gap-consuming box.
          -->
          <div class="flex flex-col gap-2">
            <div v-if="hasAuthorName || authorRole" class="flex flex-col gap-1">
              <p v-if="hasAuthorName" class="font-heading text-text text-lg font-semibold">
                {{ authorName }}
              </p>
              <p v-if="authorRole" class="text-muted">{{ authorRole }}</p>
            </div>
            <div v-if="authorBio || hasAuthorLink" class="flex flex-col gap-1">
              <p v-if="authorBio" class="text-text">{{ authorBio }}</p>
              <Link
                v-if="hasAuthorLink"
                :href="authorLinkHref!"
                :as="authorLinkAs"
                variant="standalone"
                arrow
              >
                {{ authorLinkLabel }}
              </Link>
            </div>
          </div>
        </footer>
        <EditorPlaceholder
          v-else-if="showAuthorHint"
          inline
          class="mt-12"
          :label="t('article.authorHintLabel')"
          :help="t('article.authorHintHelp')"
        />
      </Container>
    </article>
  </Section>
</template>
