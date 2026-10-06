# Eldra Starter: implementation spec

The design system for the Eldra starter storefront (demo store: Northwind Goods), written so a coding agent can build it in any framework.

| File | What it is |
| --- | --- |
| `01-core-components.md` | **Spec 1.** Non-negotiables, foundations (colour roles, type, spacing, layout, radius, shadow, motion, the focus ring, icons, imagery, voice), the WCAG 2.2 AA requirements and testing protocol, then 38 core components: actions and forms, display and commerce, overlays and navigation. |
| `02-blocks.md` | **Spec 2.** How CMS blocks work (fields, containers, backgrounds, spacing, block-width breakpoints, required states, page-level accessibility), then 33 blocks and 4 sample pages. |
| `tokens.json` | Every design token with its default value and usage note, in the W3C design-tokens format. |
| `images/core/` | One reference image per core component, showing its variants and states. |
| `images/blocks/` | Several per block: the default at 1280px and 360px, plus variants and states. |
| `images/pages/` | The four sample pages at 1280px and 360px, as consecutive slices (`--part1`, `--part2`...). |

## Suggested build order

1. **Tokens and base styles**: colour roles, type styles, spacing, radius, shadow, motion, the focus ring and reduced motion.
2. **Core components**, in spec order. Each depends only on those before it: Button and Link, then the form controls, then Select, Multi-select and the Search bar, then display and cards, then overlays (the Dialog first; Drawer, Lightbox and the Search modal build on it).
3. **Blocks**: navigation and structure first (Header, Footer), then the marketing, content and commerce blocks.
4. **Sample pages**: assemble them as the integration test.

After each component or block, work through its **Acceptance criteria** and the testing protocol in Spec 1 before moving on. Every modal is a native `<dialog>` opened as a modal. Every control meets WCAG 2.2 AA for colour and keyboard.

## Conventions used in both specs

- Measurements are in **rem** on a 16px root. Colours are always **role names** from `tokens.json`, never raw values.
- Breakpoints for blocks and components refer to the **width of their container**: below 48rem, 48–64rem, from 64rem, from 80rem.
- The small uppercase labels inside the reference images name what each row shows; they aren't part of the design. The flat shapes stand in for photos.
- Where the text and an image disagree, **the text wins**.
