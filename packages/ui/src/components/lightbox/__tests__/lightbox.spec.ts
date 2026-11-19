import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { compileKitCss } from '../../../test/kitCss';
import { mountNarrow, mountWith } from '../../../test/mount';
import { enUS } from '../../../messages/en-US';
import { currentDialog } from '../../../composables/dialogStack';
import { expectClosedModalRendersNothing } from '../../../test/modal';
import Dialog from '../../dialog/Dialog.vue';
import Lightbox from '../Lightbox.vue';
import type { LightboxImage } from '../types';
import { zoomTransform } from '../zoom';

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
    expect(root(wrapper).className).toContain('eldra:inset-0');
    expect(root(wrapper).className).toContain('eldra:h-full');
    expect(root(wrapper).className).toContain('eldra:w-full');
    wrapper.unmount();
  });

  /**
   * The stage is the viewer's own tab stop (spec "Lightbox" → Anatomy, part 5: "Stage / track …
   * focusable"), and it stays that way even though it shares `useCarousel` with `Carousel`, whose
   * slides hand that stop to the active slide as soon as one of them holds a link or a button. A
   * Lightbox slide holds an image and a caption and nothing focusable at all, so the shared
   * `syncFocusModel` leaves both the stage and the slides exactly as this component renders them —
   * asserted here rather than assumed, since the two components read the same file.
   */
  it('keeps the stage itself focusable, with no tabindex on any slide', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true, thumbnails: true },
    });
    await settle();
    expect(wrapper.find('[data-part="track"]').attributes('tabindex')).toBe('0');
    for (const slide of wrapper.findAll('[data-part="slide"]')) {
      expect(slide.attributes('tabindex')).toBeUndefined();
    }
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

  it("replaces the Image's own root, frame and caption classes with the stage's", async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const figure = wrapper.findAll('[data-part="slide"]')[0]!.find('figure');
    expect(figure.classes()).toContain('eldra:flex');
    expect(figure.classes()).not.toContain('eldra:block');
    const frame = figure.find('[data-part="frame"]').classes();
    expect(frame).toContain('eldra:w-auto');
    expect(frame).not.toContain('eldra:w-full');
    const caption = figure.find('figcaption').classes();
    expect(caption).toEqual(expect.arrayContaining(['eldra:mt-0', 'eldra:text-body-sm']));
    expect(caption).not.toContain('eldra:mt-2');
    expect(caption).not.toContain('eldra:text-caption');
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

  it('appends a classes.track override to the track', async () => {
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

  it('appends a classes.slide override to the slide, where the 4rem stage inset lives', async () => {
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
    wrapper.unmount();
  });

  it('balances the bar with an equal bottom inset unless the thumbnail strip fills that space', async () => {
    const stageClassName = async (props: {
      images: LightboxImage[];
      thumbnails?: boolean;
    }): Promise<string> => {
      const wrapper = mountWith(Lightbox, {
        props: { ariaLabel: 'Gallery', modelValue: true, ...props },
      });
      await settle();
      const className = wrapper.find('[data-part="track"]').element.parentElement!.className;
      wrapper.unmount();
      return className;
    };

    // Bar = 0.75rem padding twice + the 2.5rem close button (2.75rem below 48rem).
    expect(await stageClassName({ images: IMAGES.slice(0, 1) })).toContain(
      'eldra:pb-16 eldra:max-md:pb-17'
    );
    expect(await stageClassName({ images: IMAGES })).toContain('eldra:pb-16 eldra:max-md:pb-17');
    expect(await stageClassName({ images: IMAGES, thumbnails: true })).not.toContain('eldra:pb-16');
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
  // Fix: Major finding: an eager `<img>` starts fetching the instant it is connected to
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

  /** Fix, from the operator's own finding — the same closed-modal-renders-nothing bug the Drawer
   *  `Cart` story surfaced, guarded for every modal root the same way. */
  it('renders nothing while closed — hidden open:flex on the root, not a bare flex', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: false },
    });
    await settle();
    expectClosedModalRendersNothing(root(wrapper), 'block');
    wrapper.unmount();
  });

  it('closing it (modelValue turns false) goes back to hidden open:flex, not a leftover flex', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    await wrapper.setProps({ modelValue: false });
    await settle();
    expectClosedModalRendersNothing(root(wrapper), 'block');
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

  it('a Dialog opens on top of an already-open Lightbox — no refusal, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lightbox = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const dialog = mountWith(Dialog, { props: { title: 'Notify me', modelValue: true } });
    await settle();
    expect(root(lightbox).open).toBe(true);
    expect((dialog.element as HTMLDialogElement).open).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    // Esc acts on the top (the Dialog) only — the Lightbox stays open underneath.
    (dialog.element as HTMLDialogElement).dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
    expect((dialog.element as HTMLDialogElement).open).toBe(false);
    expect(root(lightbox).open).toBe(true);

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
    expect(root(wrapper).className).toContain('eldra:fixed');
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

describe('Lightbox — pointer drag', () => {
  /** Pins `timeStamp` the same way `carousel.spec.ts`'s own `pointerEventAt` does — real
   *  `Event.timeStamp` is set at construction, a fraction of a millisecond apart for events
   *  dispatched synchronously in a test, which would otherwise turn every drag here into an
   *  accidental flick (`useCarousel`'s release-velocity math divides by that gap). */
  function pointerEventAt(
    type: string,
    init: PointerEventInit & { clientX: number },
    t: number
  ): PointerEvent {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'timeStamp', { value: t, configurable: true });
    return event;
  }

  it('dragging the stage past the threshold and releasing changes the page, emitting update:index', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const trackEl = wrapper.find('[data-part="track"]').element as HTMLElement;
    trackEl.scrollTo = vi.fn();
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });
    // The always-mounted slide wrappers (see this component's own comment on why they never
    // v-if), stubbed with real-looking positions the same way `carousel.spec.ts` stubs offsets.
    Array.from(trackEl.children).forEach((slide, i) => {
      Object.defineProperty(slide, 'offsetLeft', { value: i * 400, configurable: true });
    });
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 300, pointerId: 1, button: 0 }, 0)
    );
    // scrollLeft lands at 400 — exactly image 2's own offset — and the second, stationary sample
    // keeps the release velocity at 0, so this is a plain release, not a flick (`carousel.spec.ts`
    // covers the flick-bias arithmetic itself; this spec only proves the drag reaches Lightbox's
    // own track and page-changes through the same `useCarousel` `goTo()`).
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: -100, pointerId: 1 }, 10));
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: -100, pointerId: 1 }, 40));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: -100, pointerId: 1 }, 50));
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[1]]);
    wrapper.unmount();
  });

  /** Same fix, same shared `useCarousel` state machine as `carousel.spec.ts`'s own equivalent spec
   *  (see that file's own comment) — proven here too since `Lightbox.vue`'s `trackClass` is a
   *  separate literal from `Carousel.vue`'s, not a shared constant. */
  it('carries scroll-auto/select-none on data-dragging and pan-x/pan-y touch-action on the track', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const classes = wrapper.find('[data-part="track"]').element.className;
    expect(classes).toContain('data-[dragging=true]:scroll-auto');
    expect(classes).toContain('data-[dragging=true]:select-none');
    expect(classes).toContain('eldra:touch-pan-x');
    expect(classes).toContain('eldra:touch-pan-y');
    wrapper.unmount();
  });

  it('suppresses document.documentElement user-select while dragging, restoring it on pointerup', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: IMAGES, modelValue: true },
    });
    await settle();
    const trackEl = wrapper.find('[data-part="track"]').element as HTMLElement;
    trackEl.scrollTo = vi.fn();
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });
    expect(document.documentElement.style.userSelect).toBe('');
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 300, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 280, pointerId: 1 }, 10));
    expect(document.documentElement.style.userSelect).toBe('none');
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 280, pointerId: 1 }, 20));
    await settle();
    expect(document.documentElement.style.userSelect).toBe('');
    wrapper.unmount();
  });
});

describe('Lightbox — compiled CSS', () => {
  it('the close button grows below a 48rem viewport through a real @media query', async () => {
    const css = await compileKitCss(['eldra:max-md:size-11']);
    expect(css).toContain('@media (width < 48rem)');
    expect(css).not.toContain('@container');
    const mediaStart = css.indexOf('@media (width < 48rem)');
    const mediaBlock = css.slice(mediaStart, css.indexOf('}', css.indexOf('{', mediaStart)) + 1);
    // `size-11` compiles to `calc(0.25rem * 11)` (the theme is inlined): the stock Tailwind
    // scale, not a value this package wrote.
    expect(mediaBlock).toContain('width: calc(0.25rem * 11);');
    expect(mediaBlock).toContain('height: calc(0.25rem * 11);');
  });
});

describe('Lightbox — zoom', () => {
  /** Two 800×600 images, so each is zoomable at 2× in the 400×300 frame `stubLayout` gives it. */
  const ZOOM_IMAGES: LightboxImage[] = [
    { src: 'z1.jpg', alt: 'Jacket, front', width: 800, height: 600 },
    { src: 'z2.jpg', alt: 'Jacket, back', width: 800, height: 600 },
  ];

  interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  const rect = (b: Box): DOMRect =>
    ({ ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height }) as DOMRect;

  /** happy-dom lays nothing out: give every slide and its image frame a real-looking box, then
   *  let the viewer measure again (a window resize is when it would in a browser). */
  async function stubLayout(
    wrapper: { find: (s: string) => { element: Element } },
    frame: Box = { left: 200, top: 100, width: 400, height: 300 },
    slide: Box = { left: 0, top: 0, width: 800, height: 500 }
  ): Promise<void> {
    const track = wrapper.find('[data-part="track"]').element;
    for (const s of Array.from(track.children)) {
      (s as HTMLElement).getBoundingClientRect = () => rect(slide);
      const f = s.querySelector('[data-part="frame"]') as HTMLElement | null;
      if (f) f.getBoundingClientRect = () => rect(frame);
    }
    window.dispatchEvent(new Event('resize'));
    await settle();
  }

  function mountZoom(props: Record<string, unknown> = {}) {
    return mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: ZOOM_IMAGES, modelValue: true, zoom: true, ...props },
    });
  }

  const slides = (wrapper: { element: Element }): HTMLElement[] =>
    Array.from(wrapper.element.querySelectorAll<HTMLElement>('[data-part="slide"]'));
  /** The `<img>` the zoom transforms: its frame is what the viewer measures, so it stays put. */
  const frameOfSlide = (slide: Element): HTMLElement =>
    slide.querySelector('[data-part="frame"]') as HTMLElement;
  const mediaOf = (slide: Element): HTMLElement =>
    slide.querySelector('img[data-part="image"]') as HTMLElement;
  const zoomButton = (wrapper: { element: Element }): HTMLButtonElement | null =>
    wrapper.element.querySelector('[data-part="zoomButton"]');

  function clickAt(el: Element, clientX: number, clientY: number): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }));
  }

  it('renders no zoom button and no data-zoomed without the zoom prop', async () => {
    const wrapper = mountWith(Lightbox, {
      props: { ariaLabel: 'Gallery', images: ZOOM_IMAGES, modelValue: true },
    });
    await settle();
    await stubLayout(wrapper);
    expect(zoomButton(wrapper)).toBeNull();
    clickAt(wrapper.find('[data-part="track"]').element, 400, 250);
    await settle();
    expect(wrapper.element.querySelector('[data-zoomed]')).toBeNull();
    wrapper.unmount();
  });

  it('renders a zoom button named "Zoom in" with zoom on', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    expect(zoomButton(wrapper)?.getAttribute('aria-label')).toBe('Zoom in');
    expect(zoomButton(wrapper)?.type).toBe('button');
    wrapper.unmount();
  });

  it('clicking the zoom button zooms in: data-zoomed on the current slide, a scale(2) transform on its image, the button renamed "Zoom out"', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    const [first, second] = slides(wrapper);
    expect(first?.getAttribute('data-zoomed')).toBe('true');
    expect(second?.hasAttribute('data-zoomed')).toBe(false);
    expect(mediaOf(first as Element).style.transform).toContain('scale(2)');
    expect(zoomButton(wrapper)?.getAttribute('aria-label')).toBe('Zoom out');
    wrapper.unmount();
  });

  it('clicking it again zooms out and clears the transform', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    zoomButton(wrapper)?.click();
    await settle();
    const [first] = slides(wrapper);
    expect(first?.hasAttribute('data-zoomed')).toBe(false);
    expect(mediaOf(first as Element).style.transform).toBe('');
    expect(zoomButton(wrapper)?.getAttribute('aria-label')).toBe('Zoom in');
    wrapper.unmount();
  });

  it('clicking the painted image zooms in; clicking the letterbox beside it does nothing', async () => {
    // A 300×600 portrait in a 400×300 frame paints 150 wide, from x = 325 to 475.
    const wrapper = mountZoom({
      images: [{ src: 'p.jpg', alt: 'Shirt, hanging', width: 300, height: 600 }],
    });
    await settle();
    await stubLayout(wrapper);
    const track = wrapper.find('[data-part="track"]').element;
    clickAt(track, 210, 250);
    await settle();
    expect(slides(wrapper)[0]?.hasAttribute('data-zoomed')).toBe(false);
    clickAt(track, 400, 250);
    await settle();
    expect(slides(wrapper)[0]?.getAttribute('data-zoomed')).toBe('true');
    wrapper.unmount();
  });

  it('offers no zoom for an image under 1.25× its painted size', async () => {
    const wrapper = mountZoom({
      images: [{ src: 's.jpg', alt: 'Scarf', width: 450, height: 338 }],
    });
    await settle();
    await stubLayout(wrapper);
    expect(zoomButton(wrapper)).toBeNull();
    clickAt(wrapper.find('[data-part="track"]').element, 400, 250);
    await settle();
    expect(slides(wrapper)[0]?.hasAttribute('data-zoomed')).toBe(false);
    wrapper.unmount();
  });

  it('uses the Icelandic labels from messages', async () => {
    const { isIS } = await import('../../../messages/is-IS');
    const wrapper = mountZoom({ messages: isIS });
    await settle();
    await stubLayout(wrapper);
    expect(zoomButton(wrapper)?.getAttribute('aria-label')).toBe('Stækka mynd');
    zoomButton(wrapper)?.click();
    await settle();
    expect(zoomButton(wrapper)?.getAttribute('aria-label')).toBe('Minnka mynd');
    wrapper.unmount();
  });

  it('has no axe violations with zoom on, zoomed and not', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    zoomButton(wrapper)?.click();
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  /** A 1600×1200 image paints 400×300 in the stubbed frame, so it zooms 4× — wider and taller
   *  than the 800×500 stage, which is what makes panning move it. */
  const BIG: LightboxImage[] = [
    { src: 'big1.jpg', alt: 'Coat, weave', width: 1600, height: 1200 },
    { src: 'big2.jpg', alt: 'Coat, lining', width: 1600, height: 1200 },
  ];

  function pointer(el: Element, type: string, init: PointerEventInit): void {
    // `pointerenter` / `pointerleave` never bubble in a browser; the rest do.
    const bubbles = type !== 'pointerenter' && type !== 'pointerleave';
    el.dispatchEvent(
      new PointerEvent(type, { bubbles, cancelable: true, pointerType: 'mouse', ...init })
    );
  }
  const track = (wrapper: { find: (s: string) => { element: Element } }): HTMLElement =>
    wrapper.find('[data-part="track"]').element as HTMLElement;

  it('shows a zoom-in cursor only while the pointer is over the painted image', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    pointer(track(wrapper), 'pointermove', { clientX: 400, clientY: 250 });
    await settle();
    expect(track(wrapper).className).toContain('eldra:cursor-zoom-in');
    expect(track(wrapper).className).not.toContain('eldra:cursor-grab ');
    pointer(track(wrapper), 'pointermove', { clientX: 50, clientY: 250 });
    await settle();
    expect(track(wrapper).className).not.toContain('eldra:cursor-zoom-in');
    expect(track(wrapper).className).toContain('eldra:cursor-grab');
    wrapper.unmount();
  });

  it('shows a zoom-out cursor anywhere on the slide while zoomed', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    pointer(track(wrapper), 'pointermove', { clientX: 20, clientY: 20 });
    await settle();
    expect(track(wrapper).className).toContain('eldra:cursor-zoom-out');
    wrapper.unmount();
  });

  it("pans with the pointer while zoomed: the left edge of the stage shows the image's left edge", async () => {
    const wrapper = mountZoom({ images: BIG });
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    pointer(track(wrapper), 'pointermove', { clientX: 0, clientY: 0 });
    await settle();
    const painted = { left: 200, top: 100, width: 400, height: 300 };
    const stage = { left: 0, top: 0, width: 800, height: 500 };
    const { x, y } = zoomTransform(painted, stage, 4, { x: 0, y: 0 });
    expect(mediaOf(slides(wrapper)[0] as Element).style.transform).toBe(
      `translate(${x}px, ${y}px) scale(4)`
    );
    wrapper.unmount();
  });

  it('pans from a fresh measurement after the frame resizes', async () => {
    const wrapper = mountZoom({ images: BIG });
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    // The window narrows: no resize event reaches the viewer before the next pointer move.
    const frame = { left: 100, top: 50, width: 200, height: 150 };
    const stage = { left: 0, top: 0, width: 400, height: 250 };
    const [first] = slides(wrapper);
    (first as HTMLElement).getBoundingClientRect = () => rect(stage);
    frameOfSlide(first as Element).getBoundingClientRect = () => rect(frame);
    pointer(track(wrapper), 'pointermove', { clientX: 400, clientY: 250 });
    await settle();
    const { x, y } = zoomTransform(frame, stage, 8, { x: 1, y: 1 });
    expect(mediaOf(first as Element).style.transform).toBe(`translate(${x}px, ${y}px) scale(8)`);
    wrapper.unmount();
  });

  it('a drag past the threshold does not toggle zoom', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    pointer(track(wrapper), 'pointerdown', { clientX: 300, clientY: 250, button: 0, pointerId: 1 });
    pointer(track(wrapper), 'pointerup', { clientX: 340, clientY: 250, button: 0, pointerId: 1 });
    clickAt(track(wrapper), 340, 250);
    await settle();
    expect(slides(wrapper)[0]?.hasAttribute('data-zoomed')).toBe(false);
    // A press that stays put is still a click.
    pointer(track(wrapper), 'pointerdown', { clientX: 300, clientY: 250, button: 0, pointerId: 2 });
    pointer(track(wrapper), 'pointerup', { clientX: 302, clientY: 251, button: 0, pointerId: 2 });
    clickAt(track(wrapper), 302, 251);
    await settle();
    expect(slides(wrapper)[0]?.getAttribute('data-zoomed')).toBe('true');
    wrapper.unmount();
  });

  it('a touch pointermove does not set the hover cursor', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    pointer(track(wrapper), 'pointermove', { clientX: 400, clientY: 250, pointerType: 'touch' });
    await settle();
    expect(track(wrapper).className).not.toContain('eldra:cursor-zoom-in');
    wrapper.unmount();
  });

  it('pauses dragging between images while zoomed', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    const trackEl = track(wrapper);
    trackEl.scrollTo = vi.fn();
    Object.defineProperty(trackEl, 'scrollLeft', { value: 0, configurable: true, writable: true });
    Array.from(trackEl.children).forEach((slide, i) => {
      Object.defineProperty(slide, 'offsetLeft', { value: i * 400, configurable: true });
    });
    zoomButton(wrapper)?.click();
    await settle();
    const at = (type: string, clientX: number, t: number): PointerEvent => {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
      });
      Object.defineProperty(event, 'timeStamp', { value: t, configurable: true });
      return event;
    };
    trackEl.dispatchEvent(at('pointerdown', 300, 0));
    trackEl.dispatchEvent(at('pointermove', -100, 10));
    trackEl.dispatchEvent(at('pointermove', -100, 40));
    trackEl.dispatchEvent(at('pointerup', -100, 50));
    await settle();
    expect(wrapper.emitted('update:index')).toBeUndefined();
    wrapper.unmount();
  });

  it('stops the track scrolling while zoomed', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    expect(track(wrapper).className).toContain('eldra:data-[zoomed=true]:overflow-x-hidden');
    expect(track(wrapper).hasAttribute('data-zoomed')).toBe(false);
    zoomButton(wrapper)?.click();
    await settle();
    expect(track(wrapper).getAttribute('data-zoomed')).toBe('true');
    wrapper.unmount();
  });

  function key(wrapper: { element: Element }, k: string): void {
    wrapper.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
    );
  }

  it('Esc zooms out and leaves the viewer open; a second Esc closes it', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    // One press is a keydown followed by the dialog's own cancel event.
    key(wrapper, 'Escape');
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
    expect(root(wrapper).open).toBe(true);
    expect(slides(wrapper)[0]?.hasAttribute('data-zoomed')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    key(wrapper, 'Escape');
    root(wrapper).dispatchEvent(new Event('cancel', { cancelable: true }));
    await settle();
    expect(root(wrapper).open).toBe(false);
    wrapper.unmount();
  });

  it('arrow keys pan while zoomed and do not change image', async () => {
    const wrapper = mountZoom({ images: BIG });
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    key(wrapper, 'ArrowRight');
    await settle();
    const painted = { left: 200, top: 100, width: 400, height: 300 };
    const stage = { left: 0, top: 0, width: 800, height: 500 };
    const { x, y } = zoomTransform(painted, stage, 4, { x: 0.5 + 0.1, y: 0.5 });
    expect(mediaOf(slides(wrapper)[0] as Element).style.transform).toBe(
      `translate(${x}px, ${y}px) scale(4)`
    );
    expect(wrapper.emitted('update:index')).toBeUndefined();
    wrapper.unmount();
  });

  it('arrow keys change image again once zoomed out', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    zoomButton(wrapper)?.click();
    await settle();
    key(wrapper, 'ArrowRight');
    await settle();
    expect(wrapper.emitted('update:index')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('disables and hides both arrows while zoomed', async () => {
    const wrapper = mountZoom({ index: 0 });
    await settle();
    await stubLayout(wrapper);
    const next = wrapper.find('[data-part="next"]').element as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    zoomButton(wrapper)?.click();
    await settle();
    for (const part of ['prev', 'next']) {
      const arrow = wrapper.find(`[data-part="${part}"]`).element as HTMLButtonElement;
      expect(arrow.disabled).toBe(true);
      expect(arrow.className).toContain('eldra:invisible');
    }
    wrapper.unmount();
  });

  it('a thumbnail click zooms out first', async () => {
    const wrapper = mountZoom({ thumbnails: true });
    await settle();
    await stubLayout(wrapper);
    track(wrapper).scrollTo = vi.fn();
    zoomButton(wrapper)?.click();
    await settle();
    await wrapper.findAll('[data-part="thumbnail"]')[1]?.trigger('click');
    await settle();
    expect(wrapper.element.querySelector('[data-part="slide"][data-zoomed]')).toBeNull();
    for (const slide of slides(wrapper)) expect(mediaOf(slide).style.transform).toBe('');
    wrapper.unmount();
  });

  it('closing while zoomed reopens zoomed out', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    await wrapper.setProps({ modelValue: false });
    await settle();
    await wrapper.setProps({ modelValue: true });
    await settle();
    await stubLayout(wrapper);
    expect(wrapper.element.querySelector('[data-part="slide"][data-zoomed]')).toBeNull();
    expect(zoomButton(wrapper)?.getAttribute('aria-label')).toBe('Zoom in');
    wrapper.unmount();
  });

  // Final review fixes.

  const stageOf = (wrapper: { element: Element }): HTMLElement =>
    (wrapper.element.querySelector('[data-part="track"]') as HTMLElement)
      .parentElement as HTMLElement;

  it('keeps the zoom button shown while the pointer crosses the letterbox to reach it', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    pointer(stageOf(wrapper), 'pointerenter', { clientX: 400, clientY: 250 });
    pointer(track(wrapper), 'pointermove', { clientX: 400, clientY: 250 });
    // On to the letterbox, then off the track onto the button itself.
    pointer(track(wrapper), 'pointermove', { clientX: 700, clientY: 450 });
    pointer(track(wrapper), 'pointerleave', { clientX: 760, clientY: 470 });
    await settle();
    expect(zoomButton(wrapper)?.className).toContain('eldra:opacity-100');
    pointer(stageOf(wrapper), 'pointerleave', { clientX: 900, clientY: 470 });
    await settle();
    expect(zoomButton(wrapper)?.className).not.toContain('eldra:opacity-100 ');
    expect(zoomButton(wrapper)?.className).toContain('eldra:opacity-0');
    wrapper.unmount();
  });

  it('zooms out when a resize leaves the image too small to zoom', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    // The window grows: the frame now paints the 800×600 image at 720×540 (under 1.25×).
    await stubLayout(
      wrapper,
      { left: 40, top: 0, width: 720, height: 540 },
      {
        left: 0,
        top: 0,
        width: 800,
        height: 560,
      }
    );
    expect(slides(wrapper)[0]?.hasAttribute('data-zoomed')).toBe(false);
    expect(mediaOf(slides(wrapper)[0] as Element).style.transform).toBe('');
    wrapper.unmount();
  });

  it('moves focus to the stage when the focused zoom button goes away', async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.focus();
    expect(document.activeElement).toBe(zoomButton(wrapper));
    await stubLayout(
      wrapper,
      { left: 40, top: 0, width: 720, height: 540 },
      {
        left: 0,
        top: 0,
        width: 800,
        height: 560,
      }
    );
    expect(zoomButton(wrapper)).toBeNull();
    expect(document.activeElement).toBe(track(wrapper));
    wrapper.unmount();
  });

  it("Esc zooms out even when its keydown never reaches the viewer (the dialog's cancel alone)", async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    const cancel = new Event('cancel', { cancelable: true });
    root(wrapper).dispatchEvent(cancel);
    await settle();
    expect(cancel.defaultPrevented).toBe(true);
    expect(root(wrapper).open).toBe(true);
    expect(slides(wrapper)[0]?.hasAttribute('data-zoomed')).toBe(false);
    wrapper.unmount();
  });

  it("stops the browser's own image drag while zoomed, so a drag pans", async () => {
    const wrapper = mountZoom();
    await settle();
    await stubLayout(wrapper);
    zoomButton(wrapper)?.click();
    await settle();
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    mediaOf(slides(wrapper)[0] as Element).dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
    wrapper.unmount();
  });
});
