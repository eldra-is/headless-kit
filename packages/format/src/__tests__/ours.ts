import { comparator } from '../compare';
import { dateTimeFormat } from '../date';
import { displayNames } from '../display-names';
import { listFormat } from '../list';
import { numberFormat } from '../number';
import { relativeTimeFormat } from '../relative-time';

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
