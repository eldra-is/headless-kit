import { defineEventHandler, getRequestHeader, setResponseHeader } from 'h3';
import { countryFromHeader } from '@eldrajs/theme-core';

export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'private, no-store');
  return { country: countryFromHeader(getRequestHeader(event, 'cf-ipcountry')) };
});
