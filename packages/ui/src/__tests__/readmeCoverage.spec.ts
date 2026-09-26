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
 * added or renamed there has no forcing function that adds or renames its README row too — task 13
 * found sixteen components missing from the table this way (`AvatarGroup`, `ButtonGroup`, `Chip`,
 * `ChipGroup`, `Container`, `CurrencyInput`, `FeatureCard`, `FormLayout`, `Icon`, `ProductCard`,
 * `Rating`, `Section`, `Skeleton`, `VariantPicker`, `VisuallyHidden`, `CheckboxGroup`), all
 * shipped by earlier tasks without a docs update. This spec is what catches the next one: it reads
 * the table between the `Customisation` and `Fields` headings and asserts every `componentNames`
 * entry appears there as its own row (`` | `Name` `` at the start of a line), so a name can only
 * ever be missing for as long as it takes to run this spec.
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
  it.each(componentNames)('%s has its own table row', (name) => {
    const rowPattern = new RegExp(`^\\s*\\|\\s*\`${name}\`\\s*\\|`, 'm');
    expect(
      customisationSection,
      `README.md's Customisation table has no row for \`${name}\``
    ).toMatch(rowPattern);
  });
});
