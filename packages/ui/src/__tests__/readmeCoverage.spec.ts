import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `publicRepoHygiene.spec.ts` and
// `source-scan.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { componentNames } from '../componentNames';

/**
 * `README.md`'s Customisation section carries a "CSS variables" table with one row per component,
 * documenting either its per-component `--eldra-*` variables or, for a component with none, that
 * it reads only the shared tokens. Nothing ties that table to `src/componentNames.ts`: a component
 * added or renamed there has no forcing function that adds or renames its README row too — a prior
 * audit found sixteen components missing from the table this way (`AvatarGroup`, `ButtonGroup`,
 * `Chip`, `ChipGroup`, `Container`, `CurrencyInput`, `FeatureCard`, `FormLayout`, `Icon`,
 * `ProductCard`, `Rating`, `Section`, `Skeleton`, `VariantPicker`, `VisuallyHidden`,
 * `CheckboxGroup`), all shipped earlier without a docs update. This spec is what catches the next
 * one: it reads the table between the `Customisation` and `Fields` headings and asserts every
 * `componentNames` entry appears there as its own row (`` | `Name` `` at the start of a line), so a
 * name can only ever be missing for as long as it takes to run this spec.
 *
 * Final review I2: this table was quietly duplicated (`f90332b`, "feat(ui): SearchModal") into two
 * consecutive, both-incomplete copies — the union of the two still satisfied "every name appears
 * *somewhere*", so this spec stayed green while the README shipped a broken table. Two guards close
 * that gap: the header itself may only occur once in the section (a second copy, complete or not,
 * fails immediately), and each component's row count must be exactly one, not "at least one" — a
 * name present in both copies would otherwise still pass the old assertion.
 */

const packageRoot = fileURLToPath(new NodeURL('../../', import.meta.url));
const readme = readFileSync(`${packageRoot}README.md`, 'utf8');

const customisationSection = (() => {
  const start = readme.indexOf('\n## Customisation');
  const end = readme.indexOf('\n## Fields', start);
  expect(start, 'README.md must have a "## Customisation" heading').toBeGreaterThan(-1);
  expect(end, 'README.md must have a "## Fields" heading after Customisation').toBeGreaterThan(
    start
  );
  return readme.slice(start, end);
})();

describe('README Customisation table lists every shipped component', () => {
  it('the CSS-variables table header appears exactly once (no duplicated table, I2)', () => {
    const headerPattern = /^\s*\|\s*Component\s*\|\s*CSS variables\s*\|\s*$/gm;
    const matches = customisationSection.match(headerPattern) ?? [];
    expect(
      matches.length,
      'README.md\'s Customisation section has more than one "Component | CSS variables" table ' +
        'header — merge the copies into a single table.'
    ).toBe(1);
  });

  it.each(componentNames)('%s has exactly one table row', (name) => {
    const rowPattern = new RegExp(`^\\s*\\|\\s*\`${name}\`\\s*\\|`, 'gm');
    const matches = customisationSection.match(rowPattern) ?? [];
    expect(
      matches.length,
      `README.md's Customisation table should have exactly one row for \`${name}\`, found ${matches.length}`
    ).toBe(1);
  });
});
