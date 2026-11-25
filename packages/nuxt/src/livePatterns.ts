interface HandlerLike {
  route?: string;
  middleware?: boolean;
}

type RouteRulesLike = Record<string, { prerender?: boolean } | undefined> | undefined;

/** Pages the site renders on request: routes marked `prerender: false` in `routeRules`. */
export function notPrerenderedPages(...rules: RouteRulesLike[]): string[] {
  return rules.flatMap((table) =>
    Object.entries(table ?? {})
      .filter(([, rule]) => rule?.prerender === false)
      .map(([route]) => route)
  );
}

/** Everything the server answers although the build wrote no file for it: its routes and pages. */
export function livePatterns(input: {
  handlers: readonly HandlerLike[];
  routeRules: RouteRulesLike[];
  extra: readonly string[];
}): string[] {
  const routes = input.handlers
    .filter((handler) => handler.route && !handler.middleware)
    .map((handler) => handler.route as string);
  return [...new Set([...input.extra, ...notPrerenderedPages(...input.routeRules), ...routes])];
}
