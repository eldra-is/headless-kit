// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';

// `EldraIcon` (the play disc, the transcript's file-text icon) resolves through `useEldraIcon` ->
// `inject(ICON_FETCHER_KEY)` outside a real Nuxt app — the same synchronous, network-free stub
// `announcement-bar`'s/`feature-grid`'s own block specs use.
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

// `mock.json` is the seed Studio writes on insert (no media — see `docs/starter-kit.md`);
// `preview.json` is the demo-imagery overlay a story merges on top of it.
const withPoster = { ...mock, ...preview };

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

function mountVideoEmbed(
  data: Record<string, unknown>,
  options: { editing?: boolean; attachTo?: Element } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
    attachTo: options.attachTo,
    global: {
      ...base.global,
      provide: { ...base.global.provide, [ICON_FETCHER_KEY]: stubFetcher },
    },
  };
  if (options.editing === true) {
    const context = opts.global.provide[ELDRA_KEY] as EldraContext;
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  const wrapper = mount(Block, opts);
  trackedWrappers.push(wrapper);
  return wrapper;
}

describe('video-embed block', () => {
  it('renders the merged (mock + preview) content and passes axe', async () => {
    const wrapper = mountVideoEmbed(withPoster);
    await flushPromises();
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.caption);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json (no poster) and passes axe', async () => {
    const wrapper = mountVideoEmbed(mock);
    await flushPromises();
    expect(wrapper.get('button').exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['contained', 'split'] as const)('passes axe for the %s variant', async (variant) => {
    const wrapper = mountVideoEmbed({ ...withPoster, variant });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('passes axe on a primary section background', async () => {
    const wrapper = mountVideoEmbed({ ...withPoster, sectionBackground: 'primary' });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('makes no provider request before activation: no youtube/vimeo host, no iframe/video/script tag in the poster markup', async () => {
    // The privacy note's own copy names the provider by design ("Loads from YouTube when you
    // press play") — what must never appear pre-activation is a *host string* a provider request
    // would actually use (an <iframe src>, a provider thumbnail <img src>), not the bare word.
    const wrapper = mountVideoEmbed(withPoster);
    await flushPromises();
    const html = wrapper.html().toLowerCase();
    expect(html).not.toContain('youtube.com');
    expect(html).not.toContain('youtube-nocookie');
    expect(html).not.toContain('vimeo.com');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<script');
  });

  it('renders the poster through UiImage when one is set', async () => {
    const wrapper = mountVideoEmbed(withPoster);
    await flushPromises();
    const img = wrapper.get('img');
    expect(img.attributes('src')).toBe(preview.poster.url);
  });

  it('falls back to a plain surface-strong fill with no poster (never a provider thumbnail)', async () => {
    const wrapper = mountVideoEmbed(mock);
    await flushPromises();
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.bg-surface-strong').exists()).toBe(true);
  });

  it("the play button's accessible name includes the title and the spoken duration; the disc and chip are aria-hidden", async () => {
    const wrapper = mountVideoEmbed(withPoster);
    await flushPromises();
    const button = wrapper.get('button');
    expect(button.attributes('aria-label')).toBe(
      'Play video: Throwing the latte mug, start to finish, 2 minutes 14 seconds'
    );
    const hiddenWrap = button.get('[aria-hidden="true"]');
    expect(hiddenWrap.text()).toContain('2:14');
  });

  it('falls back to a plain play label with no duration set', async () => {
    const wrapper = mountVideoEmbed({ ...withPoster, duration: '' });
    await flushPromises();
    expect(wrapper.get('button').attributes('aria-label')).toBe(`Play video: ${mock.videoTitle}`);
  });

  it.each(['Enter', ' '] as const)('activates on %s', async (key) => {
    const wrapper = mountVideoEmbed(withPoster, { attachTo: document.body });
    await flushPromises();
    const button = wrapper.get('button');
    await button.trigger('keydown', { key });
    await nextTick();
    expect(wrapper.find('iframe').exists()).toBe(true);
  });

  it('activates on click; the player has the videoTitle as its title, carries the play parameter, and receives focus', async () => {
    const wrapper = mountVideoEmbed(withPoster, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await nextTick();
    const iframe = wrapper.get('iframe');
    expect(iframe.attributes('title')).toBe(mock.videoTitle);
    expect(iframe.attributes('src')).toContain('autoplay=1');
    expect(iframe.attributes('src')).toContain('youtube-nocookie.com');
    await nextTick();
    expect(document.activeElement).toBe(iframe.element);
  });

  it('renders a native <video controls> for an mp4 url', async () => {
    const wrapper = mountVideoEmbed({
      ...withPoster,
      videoUrl: 'https://cdn.northwindgoods.example/videos/latte-mug.mp4',
    });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await nextTick();
    const video = wrapper.get('video');
    expect(video.attributes('controls')).toBeDefined();
    expect(video.attributes('title')).toBe(mock.videoTitle);
    expect(wrapper.find('iframe').exists()).toBe(false);
  });

  it('shows the EmptyState error variant with a working provider link for an unsupported host, never an iframe', async () => {
    const wrapper = mountVideoEmbed({ ...withPoster, videoUrl: 'https://example.com/watch?v=x' });
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.get('[role="alert"]').exists()).toBe(true);
    const link = wrapper.get('a');
    expect(link.attributes('href')).toBe('https://example.com/watch?v=x');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders nothing on the live site with an empty videoUrl', () => {
    const wrapper = mountVideoEmbed({ ...mock, videoUrl: '' });
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.find('div').exists()).toBe(false);
  });

  it('shows the "paste a link" editor hint (never an error state) with an empty videoUrl while editing', async () => {
    const wrapper = mountVideoEmbed({ ...mock, videoUrl: '' }, { editing: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Paste a YouTube or Vimeo link');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('labels the section with a visually hidden h2 holding the video title when heading is empty', async () => {
    const wrapper = mountVideoEmbed({ ...withPoster, heading: '' });
    await flushPromises();
    const heading = wrapper.get('h2');
    expect(heading.text()).toBe(mock.videoTitle);
    expect(heading.classes()).toContain('sr-only');
    const section = wrapper.get('section');
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the transcript link only when both the label and a safe href exist', async () => {
    const wrapper = mountVideoEmbed({ ...withPoster, transcriptHref: '' });
    await flushPromises();
    expect(wrapper.text()).not.toContain(mock.transcriptLabel);
  });

  it('renders the transcript row with only the privacy note when there is no caption or transcript', async () => {
    const wrapper = mountVideoEmbed({
      ...withPoster,
      caption: '',
      transcriptLabel: '',
      transcriptHref: '',
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain(mock.caption);
    expect(wrapper.text()).toContain(mock.privacyNote);
  });

  it('inverts the privacy note to primary-contrast on a primary section (muted would be 2.1:1)', async () => {
    const wrapper = mountVideoEmbed({ ...withPoster, sectionBackground: 'primary' });
    await flushPromises();
    const privacyNote = wrapper.get('figcaption p');
    expect(privacyNote.classes()).toContain('text-primary-contrast');
    expect(privacyNote.classes()).not.toContain('text-muted');
  });

  it('the play button draws its focus ring inside the clipped frame (an offset ring would be cut off)', () => {
    const wrapper = mountVideoEmbed(withPoster);
    const button = wrapper.find('button[type="button"]');
    expect(button.classes()).toContain('focus-visible:ring-inset');
    expect(button.classes().some((c) => c.includes('ring-offset'))).toBe(false);
    expect(button.element.closest('.overflow-hidden')).toBeTruthy();
  });
});
