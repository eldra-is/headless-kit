import { captureCampaignAttribution } from '@eldrajs/sdk';
import { defineNuxtPlugin, useRouter } from 'nuxt/app';

/** Remembers the campaign a visitor landed from, so `@eldrajs/sdk`'s `cart.addItem` credits it. */
export default defineNuxtPlugin({
  name: 'eldra-campaign-attribution',
  setup() {
    captureCampaignAttribution(window.location.href);
    useRouter().afterEach((to) => {
      captureCampaignAttribution(to.fullPath);
    });
  },
});
