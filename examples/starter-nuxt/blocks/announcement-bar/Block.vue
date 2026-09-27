<script setup lang="ts">
/**
 * A slim strip above the header for one short store-wide message (spec
 * `02-blocks.md` 240–338). `variant` picks the ground: `primary` (default),
 * `accent` (sales/deadlines) or `subtle` (`surface-strong`, quiet news) —
 * mapped straight onto `Section background`, which already inverts `Link`/
 * `Button` for the two coloured grounds.
 *
 * Layout is a 2-/3-column grid so the message stays optically centred
 * whether or not the dismiss button is present (block-width breakpoints
 * only): below `@tablet` (48rem) it is
 * `minmax(0,1fr) auto`, the dismiss column collapsing to nothing when there
 * is no button; from `@tablet` a hidden spacer becomes a real grid item so
 * the template reads `2rem minmax(0,1fr) 2rem`, keeping the message centred
 * even when `dismissable` is off (both flank columns stay fixed-width
 * regardless of their content).
 *
 * The link after the message uses `Link variant="standalone" arrow"`, not
 * `variant="inline"` — the package's own `arrow` prop only draws for
 * `standalone` (`Link.vue`'s `showArrow`), and standalone's weight-600 +
 * arrow + `inline-flex` box is exactly what the design spec's "inline link
 * with an arrow, weight 600, never wraps internally" line describes — the
 * package's own presentation wins over the spec's literal styling where the
 * two disagree. It is placed as a normal inline sibling straight after the
 * message text, which is what reads as "inline" in the rendered sentence.
 *
 * Dismissal is `useStorefront().history` (`app/storefront/history.ts`): `dismissAnnouncement`/
 * `isAnnouncementDismissed` take the raw message and hash it internally, so
 * this block never calls `hashMessage` itself. The dismissed check is a
 * `computed` that calls into the store's own reactive `dismissed` ref, so it
 * updates the moment `dismissAnnouncement` runs — no local mirror state
 * needed. In the Studio editor (`useEditing()`), a past dismissal never
 * hides the block: an editor needs continuous access to the fields to edit
 * them, and the design spec's "Dismissed" row is a live-site visitor
 * behaviour, not an editor one — this override does not affect any of the
 * spec's own required behaviour, since every test observes a non-editing
 * mount.
 */
import { computed, nextTick } from 'vue';
import { Button, Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'announcement-bar'> }>();
const { data } = useBlockData(props, 'announcement-bar');
const t = useT();
const isEditing = useEditing();
const storefront = useStorefront();

/** `variant` is required, so Core always supplies one of the three options. */
const background = computed<'primary' | 'accent' | 'surface-strong'>(() => {
  if (data.value.variant === 'accent') return 'accent';
  if (data.value.variant === 'subtle') return 'surface-strong';
  return 'primary';
});

const message = computed(() => data.value.message.trim());
const hasMessage = computed(() => message.value !== '');

const linkHref = computed(() => safeHref(data.value.linkHref));
const linkAs = computed(() =>
  linkHref.value !== null && isInternalHref(linkHref.value) ? EldraRouterLink : undefined
);

/** No `validators.required` on `dismissable`, so an unset value means "on" (block.json `default`). */
const dismissable = computed(() => data.value.dismissable !== false);

const isDismissed = computed(
  () =>
    hasMessage.value &&
    dismissable.value &&
    storefront.history.isAnnouncementDismissed(message.value)
);

const showLive = computed(() => hasMessage.value && (isEditing.value || !isDismissed.value));
const showEmptyHint = computed(() => !hasMessage.value && isEditing.value);

function dismiss(): void {
  if (!hasMessage.value) return;
  storefront.history.dismissAnnouncement(message.value);
  // Wait for the block to actually disappear (v-if re-render) before moving
  // focus, so the browser never has to jump twice.
  void nextTick(() => moveFocusAfterDismiss());
}

/**
 * "Focus moves to the first focusable element in the header... so focus is
 * never lost" (spec, Keyboard & accessibility). This block has no reference
 * to the header block (a sibling, not a descendant), so it looks for the
 * marker a header's own first focusable element carries
 * (`[data-eldra-header-focus]` — the skip link or brand), falling back to
 * `#main` (the page shell's own landmark, `app/pages/[...slug].vue`) when
 * none exists yet, e.g. in Storybook or a page with no header block.
 */
function moveFocusAfterDismiss(): void {
  if (typeof document === 'undefined') return;
  const headerTarget = document.querySelector<HTMLElement>('[data-eldra-header-focus]');
  if (headerTarget !== null) {
    headerTarget.focus();
    return;
  }
  const main = document.getElementById('main');
  if (main === null) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
}

/**
 * Why this bar keeps `Section` while the other two "thin bar" blocks
 * (`navigation`, `breadcrumbs`) are plain `@container` roots.
 *
 * `Section` marks every ground, `none` included, with `data-section-bg`, which is what its own
 * adjacent-same-background CSS rule keys off to drop the *next* sibling's top padding — the reason
 * `breadcrumbs` deliberately avoids it (see that block's own comment). This bar needs `Section`
 * anyway: `background` is `primary` or `accent`, and `Section` is what marks `group/section` +
 * `data-section` so the `Link` inside the bar inverts itself against an inverted ground.
 * Hand-rolling that marker would be re-implementing `Section`, which the starter's rules forbid
 * outright.
 *
 * The padding-collapse risk is real but narrow: it needs a *same-ground* `Section` immediately
 * after this bar, and `primary`/`accent` are the two grounds no content block uses (`hero`, `cta`
 * and the rest sit on `none`/`surface`/`surface-strong`). In both sample pages that carry it the
 * next block is the header, which emits no `data-section-bg` at all. A page that did put a
 * `primary` section directly under a `primary` bar would lose that section's top padding — an
 * accepted, documented trade for keeping the invert marker the bar's own link depends on, not an
 * oversight.
 */
</script>

<template>
  <Section
    v-if="showLive"
    :background="background"
    spacing="none"
    :aria-label="t('announcement.region')"
  >
    <Container width="wide">
      <div
        class="@tablet:grid-cols-[2rem_minmax(0,1fr)_2rem] @tablet:gap-0 grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2"
      >
        <span aria-hidden="true" class="@tablet:block hidden"></span>
        <!-- 0.875rem / 1.45 / weight 500 (spec's own literal recipe for this one line — no
             `text-body-sm` token pairs that exact line-height and weight, the same "no matching
             token" exception `main.css`'s rich-text rhythm already documents). -->
        <p class="text-center text-[0.875rem] leading-[1.45] font-medium text-balance">
          {{ message }}
          <Link
            v-if="data.linkLabel && linkHref"
            :href="linkHref"
            :as="linkAs"
            variant="standalone"
            arrow
            :classes="{ root: 'ml-2', label: 'whitespace-nowrap' }"
          >
            {{ data.linkLabel }}
          </Link>
        </p>
        <div
          v-if="dismissable"
          class="@tablet:mr-0 @tablet:justify-self-center -mr-2 justify-self-end"
        >
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :label="t('announcement.dismiss')"
            @click="dismiss"
          >
            <template #leadingIcon>
              <EldraIcon name="x" size="sm" />
            </template>
          </Button>
        </div>
      </div>
    </Container>
  </Section>
  <Section v-else-if="showEmptyHint" background="surface-strong" spacing="none">
    <Container width="wide">
      <div class="flex min-h-10 items-center justify-center py-2">
        <EditorPlaceholder
          inline
          :label="t('announcement.hintLabel')"
          :help="t('announcement.hintHelp')"
        />
      </div>
    </Container>
  </Section>
</template>
