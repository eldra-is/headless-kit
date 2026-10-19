import { defineNuxtPlugin } from 'nuxt/app';
import { isChunkError, shouldReload } from '../utils/chunkReload';

const KEY = 'eldra:chunk-reload-at';

// A deploy renames every `_nuxt` chunk, so a tab or cached page from the old build asks for files that are gone and its lazy blocks never render.
export default defineNuxtPlugin((nuxtApp) => {
  function reloadOnce(): void {
    let last: number | null = null;
    try {
      const stored = window.sessionStorage.getItem(KEY);
      last = stored === null ? null : Number(stored);
      if (!shouldReload(Date.now(), last)) return;
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnce();
  });
  nuxtApp.hook('app:chunkError', reloadOnce);
  nuxtApp.hook('vue:error', (error) => {
    if (isChunkError(error)) reloadOnce();
  });
});
