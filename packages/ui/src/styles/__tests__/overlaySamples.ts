import { defineComponent, h, onMounted, type VNode } from 'vue';
import { useToast } from '../../composables/useToast';
import * as ui from '../../index';
import type { SearchResults } from '../../components/search-bar/types';

export interface OverlaySample {
  name: string;
  render: () => VNode;
  /** What the spec does to open it once mounted; `null` when it mounts open. */
  open: { action: 'click' | 'focus' | 'hover'; selector: string } | null;
  /** The overlay, which has to end up outside `#app` (teleported) or in the top layer (modal). */
  overlay: { selector: string; placement: 'teleported' | 'modal' };
}

const IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#8a6f5a"/></svg>'
  );

const RESULTS: SearchResults = {
  products: [
    { id: 'p1', title: 'Wool sweater', href: '#p1', price: '12.900 kr.' },
    { id: 'p2', title: 'Wool socks', href: '#p2', price: '2.900 kr.' },
  ],
  collections: [{ id: 'c1', title: 'Knitwear', href: '#c1' }],
  articles: [{ id: 'a1', title: 'How we dye wool', href: '#a1' }],
  pages: [],
  total: 4,
};

const NO_RESULTS: SearchResults = {
  products: [],
  collections: [],
  articles: [],
  pages: [],
  total: 0,
};

const OPTIONS = [
  { value: 's', label: 'Small', group: 'Regular', hint: 'Chest 96 cm' },
  { value: 'm', label: 'Medium', group: 'Regular', meta: '2 left', metaTone: 'warning' as const },
  { value: 'l', label: 'Large', group: 'Regular', disabled: true },
  { value: 'red', label: 'Red', group: 'Colour', swatch: '#c33' },
];

const ToastDemo = defineComponent({
  setup() {
    onMounted(() => {
      const toast = useToast();
      toast.clear();
      toast.show({
        variant: 'success',
        title: 'Added to cart',
        text: 'Wool sweater',
        duration: 0,
        action: { label: 'View cart', href: '#cart' },
      });
      toast.show({ variant: 'danger', title: 'Payment failed', text: 'Try another card.' });
    });
    return () => h(ui.Toaster);
  },
});

export const OVERLAY_SAMPLES: OverlaySample[] = [
  {
    name: 'Select',
    render: () =>
      h(ui.Select, { label: 'Size', options: OPTIONS, modelValue: 'm', searchable: true }),
    open: { action: 'click', selector: '[data-part="trigger"]' },
    overlay: { selector: '[data-part="panel"]', placement: 'teleported' },
  },
  {
    name: 'MultiSelect',
    render: () =>
      h(ui.MultiSelect, {
        label: 'Colour',
        options: OPTIONS,
        modelValue: ['s', 'red'],
        clearable: true,
      }),
    open: { action: 'click', selector: '[data-part="trigger"]' },
    overlay: { selector: '[data-part="panel"]', placement: 'teleported' },
  },
  {
    name: 'SearchBar results',
    render: () => h(ui.SearchBar, { modelValue: 'wool', results: RESULTS }),
    open: { action: 'focus', selector: 'input' },
    overlay: { selector: '[data-part="panel"]', placement: 'teleported' },
  },
  {
    name: 'SearchBar no results',
    render: () =>
      h(ui.SearchBar, { modelValue: 'zzz', results: NO_RESULTS, popular: ['Wool', 'Mugs'] }),
    open: { action: 'focus', selector: 'input' },
    overlay: { selector: '[data-part="panel"]', placement: 'teleported' },
  },
  {
    name: 'Popover',
    render: () =>
      h(
        ui.Popover,
        { ariaLabel: 'Sort' },
        {
          trigger: ({ attrs }: { attrs: Record<string, unknown> }) =>
            h(ui.Button, { ...attrs, variant: 'secondary' }, () => 'Sort'),
          default: () =>
            h(ui.RadioGroup, {
              legend: 'Sort by',
              modelValue: 'new',
              options: [
                { value: 'new', label: 'Newest' },
                { value: 'price', label: 'Price' },
              ],
            }),
        }
      ),
    open: { action: 'click', selector: 'button' },
    overlay: { selector: '[data-part="panel"]', placement: 'teleported' },
  },
  {
    name: 'Tooltip',
    render: () =>
      h(ui.Tooltip, { text: 'Free returns within 30 days' }, () =>
        h(ui.Button, { variant: 'ghost' }, () => 'Returns')
      ),
    open: { action: 'hover', selector: 'button' },
    overlay: { selector: '[role="tooltip"]', placement: 'teleported' },
  },
  {
    name: 'Toaster',
    render: () => h(ToastDemo),
    open: null,
    overlay: { selector: '[data-part="list"]', placement: 'teleported' },
  },
  {
    name: 'Lightbox',
    render: () =>
      h(ui.Lightbox, {
        modelValue: true,
        ariaLabel: 'Product images',
        images: [
          { src: IMAGE, alt: 'Front', caption: 'Front', width: 800, height: 600 },
          { src: IMAGE, alt: 'Back', width: 800, height: 600 },
        ],
      }),
    open: null,
    overlay: { selector: 'dialog', placement: 'modal' },
  },
  {
    name: 'SearchModal',
    render: () => h(ui.SearchModal, { modelValue: true, query: 'wool', results: RESULTS }),
    open: null,
    overlay: { selector: 'dialog', placement: 'modal' },
  },
];
