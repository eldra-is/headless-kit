import {
  computed,
  inject,
  provide,
  toValue,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
} from 'vue';
import { enUS, type UiMessages } from '../messages/en-US';

export type { UiMessages };

/**
 * The injection key the messages provider writes to. Exported so an app can
 * set the messages from outside a `setup()` scope:
 *
 * ```ts
 * import { MESSAGES_KEY } from '@eldrajs/ui';
 * import { isIS } from '@eldrajs/ui/messages/is-IS';
 * app.provide(MESSAGES_KEY, isIS);
 * ```
 */
export const MESSAGES_KEY: InjectionKey<Partial<UiMessages>> = Symbol('eldra-ui-messages');

/**
 * Set the message overrides for this component and everything below it.
 *
 * Wraps Vue's `provide`, so it must be called during `setup()`. Use
 * `app.provide(MESSAGES_KEY, messages)` for the app-wide case.
 */
export function provideEldraUiMessages(messages: Partial<UiMessages>): void {
  provide(MESSAGES_KEY, messages);
}

/**
 * Drops keys whose value is `undefined`, so a `messages` prop assembled from
 * optional values (`{ close: props.closeLabel }`) cannot blank out a default.
 */
function defined(messages: Partial<UiMessages> | undefined): Partial<UiMessages> {
  if (!messages) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(messages)) {
    if (value !== undefined) result[key] = value;
  }
  return result as Partial<UiMessages>;
}

/**
 * The messages a component should render, resolved in precedence order:
 * the English defaults, then whatever an ancestor provided, then the
 * component's own `messages` prop.
 *
 * No i18n library is involved; a store either accepts English, imports
 * `@eldrajs/ui/messages/is-IS`, or passes its own strings.
 */
export function useMessages(
  override?: MaybeRefOrGetter<Partial<UiMessages> | undefined>
): ComputedRef<UiMessages> {
  const provided = inject(MESSAGES_KEY, undefined);
  return computed(() => ({ ...enUS, ...defined(provided), ...defined(toValue(override)) }));
}
