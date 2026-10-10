<script setup lang="ts">
/**
 * Pricing table: side-by-side subscription or service plans, each with a price, a billing note, a
 * call to action and a checklist of feature rows compared across every plan (spec `02-blocks.md`
 * 1524–1641, "Pricing table"). No `variant` field — one layout; the highlighted plan is a state
 * driven by `highlightedPlan` (a plain `string` matched against `plans[].name`, since the spec's
 * own "`none` or a plan name" `select` cannot be a static one — see Global Constraints).
 *
 * **Layout.** Below `@tablet` (48rem of the block's own width) plans stack in one column and each
 * card is a plain `flex flex-col` — no need for a shared grid since there is only one column.
 * From `@tablet`, the `<ul>` becomes `grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]` with an
 * explicit 4-row template (`grid-rows-[repeat(4,auto)]`), and every `<li>` switches to
 * `grid grid-rows-subgrid row-span-4`: its four direct children (top, price, call to action,
 * features) each land in one shared row *track*, so a track's height is driven by the tallest
 * card at that position — which is exactly what makes prices, buttons and first feature rows line
 * up across plans even when descriptions differ in length (spec → Layout, "48–64rem" /
 * "From 64rem"), with no manual height sync.
 *
 * **Highlight.** Never colour alone (spec Acceptance): the highlighted plan gets a 2px `primary`
 * border, a `surface` fill, a `Badge tone="primary" pill` (with a star icon) carrying the
 * `highlightLabel` text, and a filled `primary` `Button`; every other plan gets a 1px `border`
 * border, a `background` fill and an `outline` `Button`. The highlighted card's padding is 1px
 * less than the default at every breakpoint (`calc(...- 1px)`) so the extra border width doesn't
 * shift its content out of alignment with the other cards' (spec → Layout, "Highlighted plan").
 *
 * **Feature rows.** `featureRows` is the shared, ordered list of comparison rows; each plan's own
 * `included` is a bare `bool[]` (Core's `list` of a plain `bool` item, not a composite),
 * one entry per `featureRows` index in the same order. A short `included` array (or a
 * plan with none at all) is read as "not included" for the missing rows (`isIncluded` below), per
 * the field's own `helpText`. Every row carries the state three ways at once (spec Acceptance,
 * 1.4.1): a check/minus icon shape, visually hidden "Included:"/"Not included:" text before the
 * label, and `muted` colour on excluded rows — colour is never the only signal.
 *
 * **Icons.** The check/minus feature-row icons go through `EldraIcon` (name-based, decorative:
 * no `label`, so `Icon.vue` marks them `aria-hidden` itself) at its `md` size (1.25rem, matching
 * the spec's literal icon size) — like `footer`'s own `circle-check`, this accepts the package's
 * fixed 1.75 stroke rather than the spec's literal 2.25, the same "package wins" trade `Badge`'s
 * own icon doc comment makes explicit for exactly this reason. The badge's star icon can't go
 * through `EldraIcon` at all: `Badge.icon` takes a bare, already-bound `IconComponent` it renders
 * directly (`<component :is="icon" :stroke-width="…" aria-hidden focusable="false">`), the same
 * contract `FeatureCard.icon` has — so `StarIcon` below comes from the theme's one shared
 * name→component adapter (`app/composables/iconComponent.ts`), fixed to one name.
 *
 * **Buttons.** The spec's own literal "2.75rem below 48rem" for the call-to-action `Button md` is
 * the same in-between control height the package doesn't have (`tailwind.css`'s own comment:
 * "`Button` no longer grows at any container [width]" — the old target-touch-below-48rem growth
 * rule is gone). `cta`'s `banner` variant already documents this exact trade for its own `lg`
 * button; here it means `Button size="md" block` renders at the package's one fixed `md` height
 * (2.5rem) at every width, a deliberate, already-precedented deviation from the spec's literal
 * number, not a bug.
 */
import { computed, defineComponent, h, type Component } from 'vue';
import {
  Badge,
  Button,
  Container,
  EditorPlaceholder,
  Section,
  VisuallyHidden,
  type SectionBackground,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { iconComponent } from '../../app/composables/iconComponent';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'pricing-table'> }>();
const { data } = useBlockData(props, 'pricing-table');
const { t } = useI18n();
const isEditing = useEditing();
const uid = useUiId();
const headingId = `pricing-table-heading-${uid}`;

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const showIntroHint = computed(() => isEditing.value && !hasIntro.value);

const footnote = computed(() => (data.value.footnote ?? '').trim());

interface FeatureRow {
  label?: string;
}
interface Plan {
  name?: string;
  description?: string;
  price?: string;
  period?: string;
  note?: string;
  ctaLabel?: string;
  ctaHref?: string;
  included?: boolean[];
}

const featureRows = computed<FeatureRow[]>(() => data.value.featureRows ?? []);
const allPlans = computed<Plan[]>(() => data.value.plans ?? []);

function isPlanEmpty(plan: Plan): boolean {
  return (plan.name ?? '').trim() === '' && (plan.price ?? '').trim() === '';
}

/** Live: only plans with at least a name or price render (Global Constraints, "Editor vs live").
 *  Editing: every plan renders, so an empty one keeps its place and can show a hint instead of
 *  vanishing while an editor is filling it in. */
const renderedPlans = computed<Plan[]>(() =>
  isEditing.value ? allPlans.value : allPlans.value.filter((plan) => !isPlanEmpty(plan))
);
/** Spec → States, "Minimal content": "1 plan, which spans the full width." `auto-fit` already
 *  stretches a single grid item to the full row on its own; `col-span-full` makes that explicit
 *  and keeps it true however many empty (auto-fit-starving) tracks a browser might otherwise try
 *  to reserve. */
const isSingleItem = computed(() => renderedPlans.value.length === 1);

const highlightedPlanName = computed(() => (data.value.highlightedPlan ?? '').trim());
function isHighlighted(plan: Plan): boolean {
  const name = (plan.name ?? '').trim();
  return highlightedPlanName.value !== '' && name === highlightedPlanName.value;
}

const highlightLabel = computed(() => data.value.highlightLabel || t('pricing.mostPopular'));

/** A short (or absent) `included` array reads as "not included" for the rows past its end (the
 *  field's own `helpText`). */
function isIncluded(plan: Plan, index: number): boolean {
  return plan.included?.[index] === true;
}

function ctaHref(plan: Plan): string | null {
  return safeHref(plan.ctaHref);
}
function ctaAs(plan: Plan) {
  const href = ctaHref(plan);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}
function hasCta(plan: Plan): boolean {
  return (plan.ctaLabel ?? '').trim() !== '' && ctaHref(plan) !== null;
}

/**
 * `Badge.icon` (like `FeatureCard.icon`) takes a bare, already-bound icon component with no props
 * of its own — `EldraIcon` needs a `name` bound and so can't be handed straight through. The
 * theme's shared name→component adapter (`app/composables/iconComponent.ts`) caches per name at
 * module scope, so a reactive re-render never creates a new identity for the same icon, which would
 * otherwise remount — and re-fetch — it on every keystroke in the Studio editor.
 */
const StarIcon: Component = iconComponent('star');

/** Spec → Layout, plan card padding at each width: 1.5rem below `@tablet`, 1.25rem `@tablet`–
 *  `@content`, 2rem from `@content`. The highlighted card keeps the same three numbers minus the
 *  1px its thicker border adds, so its content stays aligned with every other card's. */
function cardPaddingClass(highlighted: boolean): string {
  return highlighted
    ? 'p-[calc(1.5rem-1px)] @tablet:p-[calc(1.25rem-1px)] @content:p-[calc(2rem-1px)]'
    : 'p-6 @tablet:p-5 @content:p-8';
}
function cardClass(highlighted: boolean, singleItem: boolean): (string | boolean)[] {
  return [
    'rounded-lg',
    'flex flex-col gap-5',
    '@tablet:grid @tablet:grid-rows-subgrid @tablet:row-span-4',
    cardPaddingClass(highlighted),
    highlighted ? 'border-2 border-primary bg-surface' : 'border border-border bg-background',
    singleItem ? '@tablet:col-span-full' : '',
  ];
}
</script>

<template>
  <Section :background="sectionBackground" spacing="md" :labelled-by="headingId">
    <Container width="content">
      <div class="mx-auto mb-8 max-w-[40rem] text-center">
        <h2
          v-if="hasHeading"
          :id="headingId"
          class="font-heading @tablet:text-[2rem] text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] text-balance"
        >
          {{ heading }}
        </h2>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          :id="headingId"
          inline
          :label="t('pricing.headingHintLabel')"
        />
        <p v-if="hasIntro" class="text-muted mt-3 text-base">{{ intro }}</p>
        <EditorPlaceholder
          v-else-if="showIntroHint"
          inline
          :label="t('pricing.introHintLabel')"
          class="mt-3"
        />
      </div>

      <ul
        role="list"
        class="@tablet:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] @tablet:grid-rows-[repeat(4,auto)] @content:gap-6 grid grid-cols-1 items-start gap-4"
      >
        <li
          v-for="(plan, index) in renderedPlans"
          :key="index"
          :aria-labelledby="`pricing-table-plan-${uid}-${index}`"
          :class="cardClass(isHighlighted(plan), isSingleItem)"
        >
          <template v-if="isEditing && isPlanEmpty(plan)">
            <EditorPlaceholder
              inline
              :label="t('pricing.planHintLabel')"
              :help="t('pricing.planHintHelp')"
            />
          </template>
          <template v-else>
            <!-- top: name + highlight badge, description -->
            <div class="flex flex-col gap-2">
              <div class="flex min-h-[1.75rem] flex-wrap items-start justify-between gap-2">
                <h3
                  :id="`pricing-table-plan-${uid}-${index}`"
                  class="font-heading text-base leading-[1.4] font-bold"
                >
                  {{ plan.name }}
                </h3>
                <Badge v-if="isHighlighted(plan)" tone="primary" pill :icon="StarIcon">
                  {{ highlightLabel }}
                </Badge>
              </div>
              <p v-if="plan.description" class="text-muted text-body-sm">
                {{ plan.description }}
              </p>
            </div>

            <!-- price -->
            <div class="flex flex-col gap-1">
              <p class="flex items-baseline gap-1">
                <span
                  class="font-heading text-[2rem] leading-[1.1] font-bold tracking-[-0.02em] tabular-nums"
                  >{{ plan.price }}</span
                >
                <span class="text-muted text-body-sm">{{ plan.period }}</span>
              </p>
              <p v-if="plan.note" class="text-muted text-body-sm">{{ plan.note }}</p>
            </div>

            <!-- call to action -->
            <div>
              <Button
                v-if="hasCta(plan)"
                :variant="isHighlighted(plan) ? 'primary' : 'outline'"
                size="md"
                block
                :href="ctaHref(plan)!"
                :as="ctaAs(plan)"
              >
                {{ plan.ctaLabel }}
              </Button>
            </div>

            <!-- features -->
            <ul
              role="list"
              :aria-label="t('pricing.includedIn', { name: plan.name ?? '' })"
              class="border-border flex flex-col gap-3 border-t pt-5"
            >
              <li
                v-for="(row, rowIndex) in featureRows"
                :key="rowIndex"
                class="flex items-start gap-2 leading-[1.45]"
                :class="isIncluded(plan, rowIndex) ? '' : 'text-muted'"
              >
                <EldraIcon
                  :name="isIncluded(plan, rowIndex) ? 'check' : 'minus'"
                  size="md"
                  class="mt-px shrink-0"
                />
                <span
                  ><VisuallyHidden>{{
                    isIncluded(plan, rowIndex) ? t('pricing.included') : t('pricing.notIncluded')
                  }}</VisuallyHidden
                  >{{ row.label }}</span
                >
              </li>
            </ul>
          </template>
        </li>
      </ul>

      <p v-if="footnote" class="text-muted text-body-sm mt-6 text-center">{{ footnote }}</p>
    </Container>
  </Section>
</template>
