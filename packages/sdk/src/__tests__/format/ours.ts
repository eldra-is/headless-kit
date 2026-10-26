import { comparator } from '../../format/compare';
import { dateTimeFormat } from '../../format/date';
import { displayNames } from '../../format/display-names';
import { listFormat } from '../../format/list';
import { numberFormat } from '../../format/number';
import { relativeTimeFormat } from '../../format/relative-time';

import { render, type Formatters } from './cases';

export const ours: Formatters = {
  number: numberFormat,
  date: dateTimeFormat,
  list: listFormat,
  relative: relativeTimeFormat,
  names: displayNames,
  compare: comparator,
};

export const renderOurs = (locale: string) => render(ours, locale);
