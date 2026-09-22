import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bridge: 'src/bridge/index.ts',
    stega: 'src/stega.ts',
    overlay: 'src/overlay.ts',
    'preview-router': 'src/previewRouter.ts',
    layout: 'src/layout.ts',
    'dynamic-route': 'src/dynamicRoute.ts',
    'template-layout': 'src/templateLayout.ts',
    reusable: 'src/reusable.ts',
    'design-tokens': 'src/designTokens.ts',
    'image-framing': 'src/imageFraming.ts',
  },
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: false,
  clean: true,
});
