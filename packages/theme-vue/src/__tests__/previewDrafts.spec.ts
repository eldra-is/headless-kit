import { reactive } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEldraClient,
  registerBlockFields,
  stripStega,
  type EldraClient,
} from '@eldrajs/theme-core';
import type { EldraContext } from '../context';
import { projectDrafts } from '../useEldraPreview';

// A top-level 'variant' select — mirrors theme-core's own CTA_FIELDS test
// fixture (client.spec.ts / stegaWalk.spec.ts), used there to prove the same
// unwrap for a *fetched* entry and a *nested* draft block. This is the
// missing third case: a draft's own top-level select (SF-2).
const CTA_FIELDS = {
  cta: [
    { fieldId: 'variant', type: 'select' },
    { fieldId: 'heading', type: 'string' },
  ],
};

function client(): EldraClient {
  return createEldraClient({
    gatewayUrl: 'https://gateway.example.test',
    orgId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    stega: false,
    fetch: (() => Promise.reject(new Error('not used'))) as unknown as typeof fetch,
  });
}

function context(): EldraContext {
  return {
    client: client(),
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: reactive({
      active: true,
      mode: 'edit',
      locale: 'en-US',
      sourceDrafts: {},
      drafts: {},
      draftSchemaApiIds: {},
      refreshRevision: 0,
      revision: 0,
      designTokensRevision: 0,
      richTextRenderRevision: 0,
      editorSupportsSlots: false,
    }),
  } as unknown as EldraContext;
}

describe('projectDrafts', () => {
  afterEach(() => {
    registerBlockFields({});
  });

  it("unwraps a draft's own top-level select field, not just one nested in an embedded block", () => {
    registerBlockFields(CTA_FIELDS);
    const target = context();
    target.preview.sourceDrafts.e1 = {
      heading: 'Shop now',
      variant: { value: 'split', label: 'Split' },
    };
    target.preview.draftSchemaApiIds.e1 = 'cta';

    projectDrafts(target);

    // Unwrapped to the plain string a Block.vue's `=== 'split'` compares
    // against — before SF-2, projectEntryDataLocale was called with no
    // apiId here, so this stayed the raw { value, label } object forever.
    // A registered select is also never stega-encoded, so `variant` needs no
    // stripping; `heading` is an ordinary string field and picks up the
    // usual invisible stega payload, stripped here to assert on content only.
    expect(target.preview.drafts.e1?.variant).toBe('split');
    expect(stripStega(target.preview.drafts.e1?.heading as string)).toBe('Shop now');
  });

  it('leaves an unregistered top-level field wrapped (not a guess)', () => {
    // No registerBlockFields call: nothing is registered for 'cta'.
    const target = context();
    target.preview.sourceDrafts.e1 = { variant: { value: 'split', label: 'Split' } };
    target.preview.draftSchemaApiIds.e1 = 'cta';

    projectDrafts(target);

    const variant = target.preview.drafts.e1?.variant as { value: string; label: string };
    expect({ value: stripStega(variant.value), label: stripStega(variant.label) }).toEqual({
      value: 'split',
      label: 'Split',
    });
  });
});
