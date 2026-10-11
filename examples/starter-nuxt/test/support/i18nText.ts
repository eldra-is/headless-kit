/**
 * `i18n/en-US.json`/`i18n/is-IS.json` escape the handful of special characters `vue-i18n`'s own
 * message syntax reserves (today, just `@` — the four email-example strings under
 * `newsletter.*`/`contact.emailInvalidError`/`product.notifyInvalid`) as `{'@'}`, the same way a
 * Vue template escapes a literal brace. A spec comparing rendered DOM text against the raw JSON
 * constant (`enUS.newsletter.emailPlaceholder`, say) has to undo that escape first, or it is
 * comparing against a string nothing ever renders.
 */
export function renderedMessage(raw: string): string {
  return raw.replace(/\{'(.)'\}/g, '$1');
}
