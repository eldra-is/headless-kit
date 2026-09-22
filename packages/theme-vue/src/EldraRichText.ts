import {
  computed,
  defineComponent,
  h,
  inject,
  shallowRef,
  watch,
  watchEffect,
  type PropType,
} from 'vue';
import { layoutIdentityOf, restampRichTextPositions, safeHref } from '@eldrajs/theme-core';
import { ELDRA_KEY } from './context';
import { renderRichTextDoc } from './richTextRender';
import { useEldraBlockField } from './useEldraBlockField';

/**
 * Renders a §18 rich-text field's TipTap JSON document. Read render only —
 * the theme SDK is a bridge, not an editor: it hosts no editing UI and
 * depends on neither TipTap nor a component library.
 *
 * §18 v3: the operator edits this render natively — theme-core's overlay
 * makes the root `contenteditable` in edit mode and reports selection, text
 * ops and commands in ProseMirror document positions; Studio owns the one
 * headless editor and the docked toolbar and echoes the document back
 * through `editor:content-update`. While Studio is editing, the root is
 * marked `data-eldra-rich-text-editing`; nothing is hidden or overlaid.
 *
 * The root carries the marking attributes the overlay's
 * `decorateStegaTextNodes`/`applyEditable`/`reconcileExternalDrafts`
 * recognize (`[data-eldra-rich-text]`) so the overlay skips per-leaf stega
 * decoration here and hands click-to-select to `theme:field-clicked`
 * instead (see theme-core's `overlay.ts`).
 *
 * Per-block toolbar: the `metadata.toolbar` data path is unchanged
 * (`block.json` → manifest → Core field metadata → Studio), but the theme no
 * longer reads it — Studio's docked toolbar does. The vite plugin's scanner
 * still validates the control ids at build time.
 *
 * Locale: an omitted `locale` prop defaults to the preview's active content
 * locale when the manifest marks the field `localized`, and to `null`
 * otherwise. That resolved locale is what `data-eldra-locale` carries, so
 * Studio edits the locale the render actually used.
 */
export const EldraRichText = defineComponent({
  name: 'EldraRichText',
  props: {
    entryId: { type: String, required: true },
    field: { type: String, required: true },
    locale: { type: String as PropType<string | null>, required: false, default: null },
    doc: { type: null as unknown as PropType<unknown>, required: true },
    /** The owning block's schema id — a block component passes `getBlockSchemaApiId(entry)`.
     * Used to resolve the field's `localized` flag from the block manifest. */
    apiId: {
      type: String as PropType<string | null | undefined>,
      required: false,
      default: undefined,
    },
  },
  setup(props, { expose }) {
    const context = inject(ELDRA_KEY, null);
    // `getBlockSchemaApiId(entry)` returns `string | null`; normalize so both
    // shapes reach the lookup the same way.
    const apiId = props.apiId ?? undefined;
    const blockField = useEldraBlockField(apiId, props.field);
    // Without an apiId there is no manifest field to ask, so a localized field
    // silently resolves to `locale: null` and Studio would edit the wrong
    // (unlocalized) draft path.
    //
    // Reactive, not a one-shot check in setup(): `preview.mode` and
    // `preview.locale` are still their defaults during the first render and
    // only become real on `editor:init`, which arrives afterwards — and block
    // components are not remounted for it. A setup-time `if` therefore never
    // fires in a real session. Warn at most once per component.
    if (apiId === undefined && props.locale === null && context !== null) {
      let warned = false;
      watchEffect(() => {
        if (warned) return;
        if (context.preview.mode !== 'edit' || context.preview.locale === null) return;
        warned = true;
        console.warn(
          `[eldra] EldraRichText: field "${props.field}" has neither an \`apiId\` nor a \`locale\` prop, ` +
            `so locale resolution is skipped and it reports \`locale: null\` while the preview is on ` +
            `"${context.preview.locale}". Pass \`api-id\` (getBlockSchemaApiId(entry)) or an explicit \`locale\`.`
        );
      });
    }
    const locale = computed<string | null>(
      () => props.locale ?? (blockField.localized ? (context?.preview.locale ?? null) : null)
    );

    expose({ locale });

    /**
     * §18 v3 deferred rendering. While the operator types natively in this
     * root, the browser owns its DOM and theme-core says so
     * (`isRichTextRenderDeferred`); replacing the tree would take the caret
     * with it. So the component renders from `rendered` rather than straight
     * from the prop, and while the field is deferred a new document only
     * re-stamps the positions in place.
     *
     * Every decision here is core's: this is the predicate, the counter that
     * makes it reactive, and the `renderKey` bump that guarantees Vue rebuilds
     * the subtree once the field comes back — its vnode tree is stale by then,
     * because the browser edited the DOM behind it, so an ordinary patch could
     * skip a change it wrongly believes is already applied.
     */
    const root = shallowRef<HTMLElement | null>(null);
    const rendered = shallowRef<unknown>(props.doc);
    const renderKey = shallowRef(0);
    let domOwnedByBrowser = false;

    watch(
      [() => props.doc, () => context?.preview.richTextRenderRevision ?? 0],
      () => {
        const deferred =
          context?.preview.isRichTextRenderDeferred?.({
            entryId: props.entryId,
            fieldPath: props.field,
            locale: locale.value,
            // The placement, so two renders of the same entry are two surfaces:
            // core reads it from these same marking attributes.
            ...layoutIdentityOf(root.value),
          }) === true;
        if (deferred) {
          domOwnedByBrowser = true;
          if (root.value !== null && restampRichTextPositions(root.value, props.doc)) return;
        }
        if (domOwnedByBrowser) {
          renderKey.value += 1;
          domOwnedByBrowser = false;
        }
        rendered.value = props.doc;
      },
      { flush: 'post' }
    );

    return () =>
      h(
        'div',
        {
          ref: root,
          'data-eldra-rich-text': '',
          'data-eldra-field': props.field,
          'data-eldra-entry': props.entryId,
          ...(locale.value ? { 'data-eldra-locale': locale.value } : {}),
        },
        renderRichTextDoc(
          rendered.value,
          // §18 v3 (floating toolbar follow-up): pad an empty textblock with a
          // caret-bearing <br> only while the field is actually being edited —
          // read here, inside the render, not hoisted to a setup-time constant,
          // because `preview.mode` is still its 'preview' default on the first
          // render and only becomes real once `editor:init` arrives, with no
          // remount to re-evaluate a one-shot check. Static/published output
          // (no context, or a context outside edit mode) is unaffected.
          { safeHref, padEmptyBlocks: context?.preview.mode === 'edit' },
          renderKey.value
        )
      );
  },
});
