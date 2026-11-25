import { defineEventHandler, getQuery, getRequestHeader, getRequestURL } from 'h3';
import builtPages from '#eldra-built-pages';
import { createLiveMatcher } from '../paths';
import { decideBuilt } from './built';
import { assetsOf, withEventHeaders } from './utils';

const isLive = createLiveMatcher(builtPages.live);

export default defineEventHandler(async (event) => {
  if (import.meta.dev || !builtPages.enabled) return;
  const url = getRequestURL(event);
  // Nuxt renders an error page as a second, internal request, carrying the error in its query.
  if (url.pathname.startsWith('/__nuxt_error')) {
    if (getRequestHeader(event, 'x-nuxt-error') !== 'true') return notFound();
    if (String(getQuery(event).data ?? '').includes('"eldraUnbuilt":true'))
      event.context.eldraUnbuiltErrorPage = true;
    return;
  }
  const assets = assetsOf(event);
  if (!assets) return;
  const decision = await decideBuilt({
    method: event.method,
    url,
    headers: event.headers,
    assets,
    isLive,
  });
  switch (decision.kind) {
    case 'built':
      return withEventHeaders(event, decision.response);
    case 'unbuilt-page':
      event.context.eldraUnbuilt = true;
      return;
    case 'not-found':
      return notFound();
    case 'method-not-allowed':
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' },
      });
  }
});

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
