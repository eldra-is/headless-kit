// A storefront-less use of the kit: list the catalog and render one CMS entry's body to HTML.
//   ELDRA_ORG_ID=<organisation id> node --experimental-strip-types index.ts
import { createEldraClient, EldraHttpError, type EldraPaginated } from '@eldrajs/sdk';
import { toHtml, type RichTextDocument } from '@eldrajs/rich-text';

const orgId = process.env.ELDRA_ORG_ID;
if (!orgId) throw new Error('Set ELDRA_ORG_ID to your organisation id.');

const eldra = createEldraClient({ orgId, apiBaseUrl: process.env.ELDRA_API_BASE_URL });

// A script has no Vite plugin generating types, so it names the fields it reads.
type ProductListItem = { title: string; slug: string };
type PageEntry = { id: string; data: { body?: RichTextDocument } };

try {
  const products = await eldra.catalog.listProducts<{ data: ProductListItem[] | null }>();
  for (const product of products.data ?? []) {
    console.log(`${product.title}  ${product.slug}`);
  }

  const pages = await eldra.cms.list<EldraPaginated<PageEntry>>('page', { limit: 1 });
  const body = pages.data[0]?.data.body;
  if (body) console.log(toHtml(body));
} catch (error) {
  if (error instanceof EldraHttpError) {
    console.error(`${error.status} ${error.errorId ?? error.code ?? ''}`.trim());
    process.exitCode = 1;
  } else {
    throw error;
  }
}
