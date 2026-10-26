/** Multiplies every length in an `<img sizes>` list by `zoom`, keeping its media conditions. */
export function zoomSizes(sizes: string, zoom: number): string {
  if (!Number.isFinite(zoom) || zoom <= 1) return sizes;
  return topLevelEntries(sizes)
    .map((entry) => zoomEntry(entry.trim(), zoom))
    .join(', ');
}

/** Puts every entry of an `<img sizes>` list under `condition` as well as its own condition. */
export function scopeSizes(sizes: string, condition: string): string {
  return topLevelEntries(sizes)
    .map((entry) => {
      const trimmed = entry.trim();
      const start = sizeValueStart(trimmed);
      const own = start > 0 ? trimmed.slice(0, start).trim() : '';
      const value = start >= 0 ? trimmed.slice(start) : trimmed;
      return `${own ? `${inParens(condition)} and ${inParens(own)}` : condition} ${value}`;
    })
    .join(', ');
}

/** The condition as one parenthesised group, so `and` can join it to another. */
function inParens(condition: string): string {
  let depth = 0;
  for (let i = 0; i < condition.length && condition.startsWith('('); i++) {
    if (condition[i] === '(') depth++;
    else if (condition[i] === ')' && --depth === 0) {
      if (i === condition.length - 1) return condition;
      break;
    }
  }
  return `(${condition})`;
}

function topLevelEntries(list: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const char = list[i];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      entries.push(list.slice(start, i));
      start = i + 1;
    }
  }
  entries.push(list.slice(start));
  return entries;
}

/** Where the entry's size value starts: its last token, or the function call it ends with. */
function sizeValueStart(entry: string): number {
  if (!entry.endsWith(')')) return entry.search(/[^\s()]+$/);
  let depth = 0;
  for (let i = entry.length - 1; i >= 0; i--) {
    if (entry[i] === ')') depth++;
    else if (entry[i] === '(' && --depth === 0) return entry.slice(0, i).search(/[\w-]+$/);
  }
  return -1;
}

function zoomEntry(entry: string, zoom: number): string {
  const start = sizeValueStart(entry);
  if (start < 0 || /^(?:auto|0)$/i.test(entry.slice(start))) return entry;
  return `${entry.slice(0, start)}calc(${entry.slice(start)} * ${zoom})`;
}
