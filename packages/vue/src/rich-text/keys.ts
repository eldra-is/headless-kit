import type { ComputedRef, InjectionKey } from 'vue';
import type { RevealDirectiveValue, RichTextMarkOverrides, RichTextNodeOverrides } from './types';

export const richTextNodeComponentsKey: InjectionKey<ComputedRef<RichTextNodeOverrides>> =
  Symbol('richTextNodeComponents');

export const richTextMarkComponentsKey: InjectionKey<ComputedRef<RichTextMarkOverrides>> =
  Symbol('richTextMarkComponents');

export const richTextRevealOptionsKey: InjectionKey<ComputedRef<RevealDirectiveValue>> =
  Symbol('richTextRevealOptions');
