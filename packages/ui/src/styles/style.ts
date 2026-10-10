// Lib entry for the compiled stylesheet. Vite 8's lib mode refuses a `.css` file as an entry
// ("rolldownOptions.input should not include CSS files" under the lib default
// `cssCodeSplit: false`), so the CSS is pulled in through this one-line module instead; Vite emits
// it as dist/style.css and `scripts/copy-css.mjs` deletes the empty dist/style.js that comes with
// it.
import './style.css';
