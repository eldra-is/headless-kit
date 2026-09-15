export type StyledTagOverride = {
  tag?: string;
  class?: string | string[] | Record<string, boolean>;
  style?: string | Record<string, string | number>;
};

// `undefined` keeps the default renderer, `null` renders children with no wrapper, a string is a
// tag, a styled override is a tag and/or class/style, and anything else is a framework component.
export type RichTextOverride<TComponent = never> = string | StyledTagOverride | TComponent | null;

export const isStringTag = (value: unknown): value is string => typeof value === 'string';

export const isStyledOverride = (value: unknown): value is StyledTagOverride =>
  typeof value === 'object' &&
  value !== null &&
  !('render' in value) &&
  !('setup' in value) &&
  !('template' in value) &&
  ('tag' in value || 'class' in value || 'style' in value);

export interface ResolvedOverride<TComponent> {
  is: string | TComponent;
  class?: StyledTagOverride['class'];
  style?: StyledTagOverride['style'];
}

export const resolveOverride = <TComponent>(
  override: RichTextOverride<TComponent> | undefined,
  defaultComponent: string | TComponent
): ResolvedOverride<TComponent> | null => {
  if (override === undefined) return { is: defaultComponent };
  if (override === null) return null;
  if (isStringTag(override)) return { is: override };
  if (isStyledOverride(override)) {
    return { is: override.tag ?? defaultComponent, class: override.class, style: override.style };
  }
  return { is: override as TComponent };
};
