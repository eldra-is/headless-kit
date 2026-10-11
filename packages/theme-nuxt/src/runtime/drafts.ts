import {
  normalizeLayoutDocument,
  type BlockSlotDefinition,
  type EntryDoc,
  type SlotValidationContext,
} from '@eldrajs/theme-core';
import themeManifest from 'virtual:eldra/manifest';

/** Applies in-memory builder updates to resolved entries without putting draft data in URLs. */
export function overlayPreviewDrafts(
  page: EntryDoc | null | undefined,
  drafts: Record<string, Record<string, unknown>>,
  draftSchemaApiIds: Readonly<Record<string, string>> = {}
): EntryDoc | null {
  // Nuxt's async-data ref is undefined until the first request settles. The
  // builder can deliver preview drafts during that window, so keep the
  // initial render empty instead of dereferencing an unloaded page.
  if (page == null) return null;
  const pageDraft = drafts[page.id];
  const data = pageDraft === undefined ? { ...page.data } : { ...page.data, ...pageDraft };
  const resolvedById = new Map(
    (Array.isArray(page.data.blocks) ? page.data.blocks : [])
      .filter((block): block is EntryDoc => isEntryDoc(block))
      .map((block) => [block.id, block])
  );
  const layoutEntryIds = layoutBlockEntryIds(data.layout, resolvedById, draftSchemaApiIds);
  if (layoutEntryIds !== null) {
    const reusableEntryIds = reusableProjectionEntryIds(
      page.reusableComponentProjection,
      resolvedById,
      draftSchemaApiIds
    );
    const blocks = [...new Set([...layoutEntryIds, ...reusableEntryIds])].flatMap((entryId) => {
      const published = resolvedById.get(entryId);
      const draft = drafts[entryId];
      if (published !== undefined) {
        return [{ ...published, ...(draft === undefined ? {} : { data: draft }) }];
      }
      const schemaApiId = draftSchemaApiIds[entryId];
      return draft !== undefined && schemaApiId !== undefined
        ? [{ id: entryId, schemaApiId, data: draft }]
        : [];
    });
    return { ...page, data: { ...data, blocks } };
  }
  const blocks = Array.isArray(data.blocks)
    ? data.blocks.map((block) => resolvedReference(block, resolvedById))
    : data.blocks;
  if (!Array.isArray(blocks)) return { ...page, data };
  return {
    ...page,
    data: {
      ...data,
      blocks: blocks.map((block) => {
        if (!isEntryDoc(block)) return block;
        const draft = drafts[block.id];
        return draft === undefined ? block : { ...block, data: draft };
      }),
    },
  };
}

function reusableProjectionEntryIds(
  value: unknown,
  byId: ReadonlyMap<string, EntryDoc>,
  draftSchemaApiIds: Readonly<Record<string, string>>
): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const revisions = (value as { revisions?: unknown }).revisions;
  if (!Array.isArray(revisions)) return [];
  return revisions.flatMap((revision) => {
    if (typeof revision !== 'object' || revision === null) return [];
    return (
      layoutBlockEntryIds((revision as { document?: unknown }).document, byId, draftSchemaApiIds) ??
      []
    );
  });
}

/**
 * Module-scope catalog of every block's declared slots, derived once from the
 * theme manifest — the same virtual module and shape EldraLayout.ts consumes,
 * so the draft projection validates slot children against the same allowlists
 * the renderer enforces. Without it, normalizeLayoutDocument fails closed
 * (SLOT_UNKNOWN) on every v3 document carrying `slots` and the projection
 * silently degrades to the pass-through branch.
 */
function buildSlotCatalog(): Record<string, ReadonlyArray<BlockSlotDefinition>> {
  const blocks =
    (themeManifest as { blocks?: Array<{ apiId?: string; slots?: BlockSlotDefinition[] }> })
      .blocks ?? [];
  const out: Record<string, ReadonlyArray<BlockSlotDefinition>> = {};
  for (const block of blocks) {
    if (block.apiId && Array.isArray(block.slots)) out[block.apiId] = block.slots;
  }
  return out;
}
const THEME_SLOT_CATALOG = buildSlotCatalog();

function layoutBlockEntryIds(
  value: unknown,
  byId: ReadonlyMap<string, EntryDoc>,
  draftSchemaApiIds: Readonly<Record<string, string>>
): string[] | null {
  if (value === undefined) return null;
  // Slot validation needs the schema of every entry the layout references,
  // including draft-only slot children that are not (yet) in the published
  // blocks array (C14 drop-into-slot): resolve from the draft schema map too.
  const slotContext: SlotValidationContext = {
    slotCatalog: THEME_SLOT_CATALOG,
    entryApiId: (entryId) => byId.get(entryId)?.schemaApiId ?? draftSchemaApiIds[entryId],
  };
  try {
    return normalizeLayoutDocument(value, undefined, undefined, slotContext).blockEntryIds;
  } catch {
    // Preserve the invalid draft for EldraLayout to reject as one document.
    return null;
  }
}

function resolvedReference(value: unknown, byId: ReadonlyMap<string, EntryDoc>): unknown {
  if (isEntryDoc(value)) return value;
  if (typeof value !== 'object' || value === null) return value;
  const reference = value as { id?: unknown; type?: unknown; value?: unknown };
  const id =
    typeof reference.id === 'string'
      ? reference.id
      : reference.type === 'entry' && typeof reference.value === 'string'
        ? reference.value
        : undefined;
  return typeof id === 'string' ? (byId.get(id) ?? value) : value;
}

function isEntryDoc(value: unknown): value is EntryDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { data?: unknown }).data === 'object' &&
    (value as { data?: unknown }).data !== null
  );
}
