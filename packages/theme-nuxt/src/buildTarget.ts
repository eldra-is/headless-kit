/**
 * Which kind of build this is. A build is **production** unless `ELDRA_BUILD_TARGET=preview`; an
 * unset or empty variable is production, and any other value is warned about and counts as
 * production too (a typo must not silently de-index nothing, nor silently publish a preview).
 * `nuxi dev` is always treated as a preview by the module, whatever this says.
 */
export type BuildTarget = 'production' | 'preview';

export function resolveBuildTarget(
  value: string | undefined,
  warn: (message: string) => void = (message) => console.warn(message)
): BuildTarget {
  const target = value?.trim().toLowerCase() ?? '';
  if (target === 'preview') return 'preview';
  if (target !== '' && target !== 'production') {
    warn(
      `[eldra] ELDRA_BUILD_TARGET="${value}" is not "production" or "preview"; treating this as a production build.`
    );
  }
  return 'production';
}
