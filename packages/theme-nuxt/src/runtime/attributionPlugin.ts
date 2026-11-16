import {
  captureCampaignAttribution,
  grantCampaignAttributionConsent,
  withdrawCampaignAttributionConsent,
} from '@eldrajs/sdk';
import { defineNuxtPlugin, useRouter } from 'nuxt/app';

declare global {
  interface Window {
    /** The visitor's answer from the site's consent tool; the kit keeps campaign tags only while it is `true`. */
    eldraCampaignAttributionConsent?: boolean;
  }
}

const CONSENT_EVENT = 'eldra:campaign-attribution-consent';

function applyConsent(): void {
  if (window.eldraCampaignAttributionConsent === true) grantCampaignAttributionConsent();
  else if (window.eldraCampaignAttributionConsent === false) withdrawCampaignAttributionConsent();
}

/** Notes the campaign a visitor landed from and keeps it, for `@eldrajs/sdk`'s `cart.addItem`, once they agree. */
export default defineNuxtPlugin({
  name: 'eldra-campaign-attribution',
  setup() {
    // A consent tool may answer before this plugin runs, so the answer is read from the window as well as heard.
    applyConsent();
    window.addEventListener(CONSENT_EVENT, applyConsent);
    captureCampaignAttribution(window.location.href);
    useRouter().afterEach((to, _from, failure) => {
      // A blocked or cancelled navigation never reached `to`, so its tags are not a landing.
      if (!failure) captureCampaignAttribution(to.fullPath);
    });
  },
});
