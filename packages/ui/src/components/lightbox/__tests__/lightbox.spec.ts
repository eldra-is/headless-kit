import { fileURLToPath, URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';
import { mountNarrow, mountWith } from '../../../test/mount';
import { enUS } from '../../../messages/en-US';
import { currentDialog } from '../../../composables/dialogStack';
import Dialog from '../../dialog/Dialog.vue';
import Lightbox from '../Lightbox.vue';
import type { LightboxImage } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

const IMAGES: LightboxImage[] = [
  { src: 'a.jpg', alt: 'Sweater, front', caption: 'Oatmeal, folded.', width: 800, height: 600 },
  { src: 'b.jpg', alt: 'Sweater, worn', width: 800, height: 1000 },
  { src: 'c.jpg', alt: 'Sweater, cuff detail', caption: 'Ribbed cuff.', width: 800, height: 600 },
  { src: 'd.jpg', alt: 'Sweater, on a hanger', width: 600, height: 900 },
];

function root(wrapper: { element: Element }): HTMLDialogElement {
  return wrapper.element as HTMLDialogElement;
}

function closeButton(wrapper: { find: (s: string) => { element: Element } }): HTMLElement {
  return wrapper.find('[data-part="close"]').element as HTMLElement;
}

async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe('Lightbox — element and structure', () => {
  it('is a native <dialog>, aria-labelled, filling the viewport', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Merino crew sweater, images', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(root(wrapper).tagName).toBe('DIALOG');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('aria-label')).toBe('Merino crew sweater, images');
    expect(root(wrapper).className).toContain('inset-0');
    expect(root(wrapper).className).toContain('h-full');
    expect(root(wrapper).className).toContain('w-full');
    wrapper.unmount();
  });

  it('gives every slide role=group, a slide roledescription and an "n of total" label', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const slides = wrapper.findAll('[data-part="slide"]');
    expect(slides).toHaveLength(4);
    slides.forEach((slide, i) => {
      expect(slide.attributes('role')).toBe('group');
      expect(slide.attributes('aria-roledescription')).toBe('slide');
      expect(slide.attributes('aria-label')).toBe(enUS.imageOf(i + 1, 4));
    });
    // The real <figure>/<figcaption> pairing (only for a captioned image — `Image`'s own rule)
    // nests one level in — see `Lightbox.vue`'s own comment on `slideClass` for why `role="group"`
    // cannot land on the `<figure>` itself.
    expect(slides[0]?.find('figure').exists()).toBe(true);
    expect(slides[1]?.find('figure').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a real <img> as data-part="image", with real alt text', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const firstImage = wrapper.findAll('[data-part="image"]')[0];
    expect(firstImage?.element.tagName).toBe('IMG');
    expect(firstImage?.attributes('src')).toBe('a.jpg');
    expect(firstImage?.attributes('alt')).toBe('Sweater, front');
    wrapper.unmount();
  });

  it('names the track "Images" (the spec\'s own literal word), not Carousel\'s "Slides"', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(wrapper.find('[data-part="track"]').attributes('aria-label')).toBe(enUS.lightboxImages);
    wrapper.unmount();
  });

  it('passes a classes.track override through tailwind-merge', async () => {
    const wrapper = mountWith(Lightbox, {
      props: {
        ariaLabel: 'Gallery',
        images: IMAGES,
        modelValue: true,
        classes: { track: 'gap-8' },
      },
    });
    await settle();
    expect(wrapper.find('[data-part="track"]').element.className).toContain('gap-8');
    wrapper.unmount();
  });

  it('passes a classes.slide override through tailwind-merge, replacing the 4rem stage inset', async () => {
    // `px-16` (spec "Sizes": "Stage side padding: 4rem each side") lives on the slide, not the
    // track — see `slideClass`'s own comment for why padding on the scrolling element itself
    // would let the next slide peek into view at rest.
    const wrapper = mountWith(Lightbox, {
      props: {
        ariaLabel: 'Gallery',
        images: IMAGES,
        modelValue: true,
        classes: { slide: 'px-4' },
      },
    });
    await settle();
    const slideClassName = wrapper.find('[data-part="slide"]').element.className;
    expect(slideClassName).toContain('px-4');
    expect(slideClassName).not.toContain('px-16');
    wrapper.unmount();
  });
});

describe('Lightbox — captions', () => {
  it('renders a figcaption for a slide with one, and none for a slide without', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const slides = wrapper.findAll('[data-part="slide"]');
    const firstCaption = slides[0]?.find('[data-part="caption"]');
    expect(firstCaption?.exists()).toBe(true);
    expect(firstCaption?.element.tagName).toBe('FIGCAPTION');
    expect(firstCaption?.text()).toBe('Oatmeal, folded.');
    expect(slides[1]?.find('[data-part="caption"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Lightbox — images mount only while open', () => {
  // Fix round 1, Major finding: an eager `<img>` starts fetching the instant it is connected to
  // the DOM, regardless of `display: none` on the closed `<dialog>` ancestor — so every slide's
  // `Image` (the element that actually carries a `src`) must not exist at all until `model` is
  // `true`. The slide *wrapper* (`data-part="slide"`) stays mounted throughout, since
  // `useCarousel`'s own index/count maths reads its children's count directly and must not depend
  // on `MutationObserver` timing across an open/close transition.
  it('renders no <img> anywhere in the document while mounted closed', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: false, thumbnails: true },
    });
    await settle();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    // The slide wrappers themselves still exist (useCarousel's own count reads them), just empty.
    expect(wrapper.findAll('[data-part="slide"]')).toHaveLength(4);
    expect(wrapper.find('[data-part="thumbnails"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders one eager <img> per image once opened', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: false, thumbnails: true },
    });
    await settle();
    await wrapper.setProps({ modelValue: true });
    await settle();
    const slideImages = wrapper.findAll('[data-part="image"]');
    expect(slideImages).toHaveLength(4);
    slideImages.forEach((img) => expect(img.attributes('loading')).toBe('eager'));
    // Thumbnails are their own, separate <img>s (cover-fit, decorative) — 4 more, 8 total.
    expect(document.querySelectorAll('img')).toHaveLength(8);
    wrapper.unmount();
  });

  it('removes the images again once closed, so a reopened gallery starts clean', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true, thumbnails: true },
    });
    await settle();
    expect(document.querySelectorAll('img').length).toBeGreaterThan(0);
    await wrapper.setProps({ modelValue: false });
    await settle();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('Lightbox — opens at index', () => {
  it('opens already positioned at a non-zero index (counter reflects it immediately)', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true, index: 2 },
    });
    await settle();
    expect(wrapper.find('[data-part="counter"]').text()).toBe(enUS.counter(3, 4));
    wrapper.unmount();
  });

  it('jumps to the starting index without asking the track to animate, regardless of motion preference', async () => {
    // Mount closed first so the track element exists to stub before the open-triggered jump runs.
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: false, index: 2 },
    });
    const track = wrapper.find('[data-part="track"]').element as HTMLElement;
    track.scrollTo = vi.fn();
    await wrapper.setProps({ modelValue: true });
    await settle();
    expect(track.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    wrapper.unmount();
  });
});

describe('Lightbox — arrows and keyboard navigate, emitting update:index', () => {
  it('advances with the next arrow and emits update:index', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('← / → move the image from the close button — anywhere in the viewer, not only the track', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    closeButton(wrapper).focus();
    expect(document.activeElement).toBe(closeButton(wrapper));
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[1]]);
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[1], [0]]);
    wrapper.unmount();
  });

  it('never fires twice for one key press when the track itself is focused', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const trackEl = wrapper.find('[data-part="track"]').element as HTMLElement;
    trackEl.focus();
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[1]]);
    wrapper.unmount();
  });
});

describe('Lightbox — wrap rule (never loops)', () => {
  it('disables next at the last image and never advances past it', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    for (let n = 0; n < 5; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await wrapper.find('[data-part="next"]').trigger('click');
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }
    expect(wrapper.emitted('update:index')).toEqual([[1], [2], [3]]);
    expect((wrapper.find('[data-part="next"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('disables previous at the first image', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    expect((wrapper.find('[data-part="prev"]').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('moves focus off a disabled arrow onto the other one', async () => {
    const wrapper = mountWith(Lightbox, {
      props: {
        ariaLabel: 'Gallery',
        images: [IMAGES[0] as LightboxImage, IMAGES[1] as LightboxImage],
        modelValue: true,
      },
    });
    await settle();
    const prevBtn = wrapper.find('[data-part="prev"]').element as HTMLButtonElement;
    const nextBtn = wrapper.find('[data-part="next"]').element as HTMLButtonElement;
    nextBtn.focus();
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(nextBtn.disabled).toBe(true);
    expect(document.activeElement).toBe(prevBtn);
    wrapper.unmount();
  });
});

describe('Lightbox — single image', () => {
  it('hides the arrows and counter with only one image', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'One photo', images: [IMAGES[0] as LightboxImage], modelValue: true },
    });
    await settle();
    expect(wrapper.find('[data-part="prev"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="next"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="counter"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-part="slide"]')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Lightbox — thumbnails strip', () => {
  it('renders one thumbnail per image, named "Go to image n", aria-current on the shown one', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true, thumbnails: true },
    });
    await settle();
    const thumbs = wrapper.findAll('[data-part="thumbnail"]');
    expect(thumbs).toHaveLength(4);
    expect(thumbs[0]?.attributes('aria-current')).toBe('true');
    expect(thumbs[1]?.attributes('aria-current')).toBeUndefined();
    expect(thumbs[2]?.attributes('aria-label')).toBe(enUS.goToImage(3));
    wrapper.unmount();
  });

  it('selects the image a thumbnail is clicked, moving aria-current and emitting update:index', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true, thumbnails: true },
    });
    await settle();
    await wrapper.findAll('[data-part="thumbnail"]')[2]?.trigger('click');
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[2]]);
    const thumbsAfter = wrapper.findAll('[data-part="thumbnail"]');
    expect(thumbsAfter[2]?.attributes('aria-current')).toBe('true');
    expect(thumbsAfter[0]?.attributes('aria-current')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders no strip without the thumbnails prop, and none for a single image even if set', async () => {
    const withoutProp = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(withoutProp.find('[data-part="thumbnails"]').exists()).toBe(false);
    withoutProp.unmount();

    const single = mountWith(Lightbox, {
      props: {
        ariaLabel: 'One photo',
        images: [IMAGES[0] as LightboxImage],
        modelValue: true,
        thumbnails: true,
      },
    });
    await settle();
    expect(single.find('[data-part="thumbnails"]').exists()).toBe(false);
    single.unmount();
  });
});

describe('Lightbox — open and close (useDialog)', () => {
  it('opens with showModal, reflected as the open attribute', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('the close button closes it', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    await closeButton(wrapper).click();
    await settle();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('Esc closes it', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('there is no backdrop click — a click on the dialog element itself does not close it', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    root(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('never stacks with a Dialog — the shared modal slot refuses the second one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lightbox = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const dialog = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await settle();
    expect(root(lightbox).open).toBe(true);
    expect((dialog.element as HTMLDialogElement).open).toBe(false);
    expect(warn).toHaveBeenCalled();
    lightbox.unmount();
    dialog.unmount();
  });

  it('releases the shared slot on unmount', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    wrapper.unmount();
    expect(currentDialog()).toBeNull();
  });

  /** Final review M2/item 1 — see `dialog.spec.ts`'s identical pair for the full rationale: a
   *  literal `false` default snaps the viewer shut the instant a parent stops binding v-model. */
  it('going uncontrolled (modelValue prop removed) keeps the viewer open instead of snapping shut', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    await wrapper.setProps({ modelValue: undefined });
    expect(root(wrapper).open).toBe(true);
    wrapper.unmount();
  });

  it('once uncontrolled, its own close button still closes it and emits update:modelValue(false)', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    await wrapper.setProps({ modelValue: undefined });
    await closeButton(wrapper).click();
    await settle();
    expect(root(wrapper).open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });
});

describe('Lightbox — initial focus and focus return', () => {
  it('focuses the close button on open, not the first arrow', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(document.activeElement).toBe(closeButton(wrapper));
    wrapper.unmount();
  });

  it('returns focus to the opener once the viewer closes', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Zoom image';
    document.body.append(opener);
    opener.focus();

    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(document.activeElement).not.toBe(opener);

    await wrapper.setProps({ modelValue: false });
    await settle();
    expect(document.activeElement).toBe(opener);

    wrapper.unmount();
    opener.remove();
  });
});

describe('Lightbox — narrow', () => {
  it('fills the real viewport from a 20rem ancestor, with no axe violations', async () => {
    const wrapper = mountNarrow(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true, thumbnails: true },
    });
    await settle();
    expect(root(wrapper).className).toContain('fixed');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Lightbox — accessibility', () => {
  it('has no axe violations, gallery with captions and counter', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Merino crew sweater, images', images: IMAGES, modelValue: true },
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations, with thumbnails', async () => {
    const wrapper = mountWith(Lightbox, {
      props: {
        ariaLabel: 'Merino crew sweater, images',
        images: IMAGES,
        modelValue: true,
        thumbnails: true,
      },
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations, single image', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'One photo', images: [IMAGES[0] as LightboxImage], modelValue: true },
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Lightbox — built CSS', () => {
  const distDir = fileURLToPath(new NodeURL('../../../../dist/', import.meta.url));
  const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

  it.runIf(built)(
    'the close button grows below a 48rem viewport through a real @media query',
    async () => {
      const { compile } = await import('@tailwindcss/node');
      const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
        base: distDir,
        onDependency() {},
      });
      const css = compiler.build(['max-md:size-11']);
      expect(css).toContain('@media (width < 48rem)');
      expect(css).not.toContain('@container');
      const mediaStart = css.indexOf('@media (width < 48rem)');
      const mediaBlock = css.slice(mediaStart, css.indexOf('}', css.indexOf('{', mediaStart)) + 1);
      // `size-11` compiles to `calc(var(--spacing) * 11)` (2.75rem at the stock `--spacing: 0.25rem`),
      // not the literal number — the stock Tailwind scale, not a value this package wrote.
      expect(mediaBlock).toContain('width: calc(var(--spacing) * 11);');
      expect(mediaBlock).toContain('height: calc(var(--spacing) * 11);');
    }
  );

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
