/**
 * Mock `virtual:eldra/breakpoints` module — the theme's resolved layout
 * breakpoints, carried separately from `virtual:eldra/manifest` (which is
 * exactly what is persisted/uploaded; Core's ingest rejects an unrecognized
 * top-level key there). Defaults, matching a theme that configures none;
 * `test/breakpoints.test.ts` overrides this per-file for the custom case.
 */
export default { tablet: 768, normal: 1024 };
