// Priced catalog reads and cart writes for a signed-in business customer (docs/customer-prices.md).
// Server-side only: the token comes from your session store, never from the browser.
import { createEldraClient, customerHeaders, EldraHttpError } from '@eldrajs/sdk';

export interface PricedSession {
  accessToken: string;
  /** The active company; leave out when the person has exactly one. */
  customerId?: string;
}

export async function pricedProducts(
  eldra: ReturnType<typeof createEldraClient>,
  session: PricedSession | undefined
) {
  // A guest sends no Authorization header at all.
  const headers = session && customerHeaders(session.accessToken, session.customerId);
  try {
    // Render the result dynamically and never cache it: it differs per customer.
    return await eldra.catalog.listProducts({ limit: 20 }, { headers });
  } catch (error) {
    // B2B switched off: continue as a guest here; your session store must also end the session.
    if (error instanceof EldraHttpError && error.errorId === 'FEATURE_DISABLED') {
      return eldra.catalog.listProducts({ limit: 20 });
    }
    throw error;
  }
}
