// `typecheck:storybook` runs plain `tsc` (not `vue-tsc`) over `.storybook/**`
// and the generated `stories/**`, so it needs its own `*.vue` module shim —
// `vue-tsc` (what `nuxi typecheck` uses) understands `.vue` imports natively
// and needs no shim, which is why the app itself has none.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
