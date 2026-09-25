import { afterEach, describe, expect, it, vi } from 'vitest';
import { isIS } from '../../../messages/is-IS';
import { MESSAGES_KEY } from '../../../composables/useMessages';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import AvatarGroup from '../AvatarGroup.vue';
import type { AvatarGroupPerson } from '../types';

const PEOPLE: AvatarGroupPerson[] = [
  { name: 'Ingrid Solberg', src: '/demo/ingrid.jpg' },
  { name: 'Tomas Berg' },
  { name: 'Maya Okafor' },
];

const SEVEN_PEOPLE: AvatarGroupPerson[] = [
  ...PEOPLE,
  { name: 'Elin Vik' },
  { name: 'Noah Kallio' },
  { name: 'Priya Nair' },
  { name: 'Studio' },
];

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AvatarGroup — element and parts', () => {
  it('renders a root with role="group" and one item per person, no overflow', () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: PEOPLE, label: 'Makers' } });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBe('group');
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(3);
    expect(wrapper.find('[data-part="more"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('names the group via aria-labelledby, pointing at the srText part', () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: PEOPLE, label: 'Makers' } });
    const labelledBy = wrapper.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const srText = wrapper.get('[data-part="srText"]');
    expect(srText.attributes('id')).toBe(labelledBy);
    wrapper.unmount();
  });

  it('hides every avatar and the "+N" counter from assistive technology', () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: SEVEN_PEOPLE, label: 'Makers' } });
    for (const item of wrapper.findAll('[data-part="item"] [data-part="root"]')) {
      expect(item.attributes('aria-hidden')).toBe('true');
    }
    expect(wrapper.get('[data-part="more"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});

describe('AvatarGroup — max and overflow', () => {
  it('shows every avatar and no counter when people fit within max', () => {
    const wrapper = mountWith(AvatarGroup, {
      props: { people: PEOPLE.slice(0, 2), label: 'Makers' },
    });
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(2);
    expect(wrapper.find('[data-part="more"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows max avatars plus a "+N" counter for the rest, with the default max of 3', () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: SEVEN_PEOPLE, label: 'Makers' } });
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(3);
    expect(wrapper.get('[data-part="more"]').text()).toBe('+4');
    wrapper.unmount();
  });

  it('honours a smaller explicit max', () => {
    const wrapper = mountWith(AvatarGroup, {
      props: { people: PEOPLE, label: 'Makers', max: 1 },
    });
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(1);
    expect(wrapper.get('[data-part="more"]').text()).toBe('+2');
    wrapper.unmount();
  });

  /**
   * Spec "Avatar" → Acceptance criteria: "Groups never show more than four circles in total."
   * `max` is documented as adjustable, but this is the one invariant that holds regardless —
   * passing something absurd does not blow past 3 avatars + 1 counter.
   */
  it('clamps an oversized max so the group never exceeds four circles in total', () => {
    const wrapper = mountWith(AvatarGroup, {
      props: { people: SEVEN_PEOPLE, label: 'Makers', max: 10 },
    });
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(3);
    expect(wrapper.get('[data-part="more"]').text()).toBe('+4');
    wrapper.unmount();
  });

  it('renders no counter at all when max already covers everyone', () => {
    const wrapper = mountWith(AvatarGroup, {
      props: { people: PEOPLE, label: 'Makers', max: 3 },
    });
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(3);
    expect(wrapper.find('[data-part="more"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('AvatarGroup — the accessible sentence', () => {
  it('reads "Label: a, b, c and N more" in English, matching the spec\'s own example', () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: SEVEN_PEOPLE, label: 'Makers' } });
    expect(wrapper.get('[data-part="srText"]').text()).toBe(
      'Makers: Ingrid Solberg, Tomas Berg, Maya Okafor and 4 more'
    );
    wrapper.unmount();
  });

  it('reads the plain conjunction list with no "more" when nothing overflows', () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: PEOPLE, label: 'Makers' } });
    expect(wrapper.get('[data-part="srText"]').text()).toBe(
      'Makers: Ingrid Solberg, Tomas Berg and Maya Okafor'
    );
    wrapper.unmount();
  });

  it('translates through provideEldraUiMessages, including the Icelandic join word', () => {
    const wrapper = mountWith(AvatarGroup, {
      props: { people: SEVEN_PEOPLE, label: 'Smiðir' },
      global: { provide: { [MESSAGES_KEY as symbol]: isIS } },
    });
    expect(wrapper.get('[data-part="srText"]').text()).toBe(
      'Smiðir: Ingrid Solberg, Tomas Berg, Maya Okafor og 4 til viðbótar'
    );
    wrapper.unmount();
  });
});

describe('AvatarGroup — axe', () => {
  it('has no violations with no overflow', async () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: PEOPLE, label: 'Makers' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations with overflow', async () => {
    const wrapper = mountWith(AvatarGroup, { props: { people: SEVEN_PEOPLE, label: 'Makers' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('AvatarGroup — narrow container', () => {
  it('renders in a 20rem container without overflowing', () => {
    const wrapper = mountNarrow(AvatarGroup, {
      props: { people: SEVEN_PEOPLE, label: 'Makers' },
    });
    const host = wrapper.element.closest('[data-eldra-narrow-host]') as HTMLElement;
    expect(host).not.toBeNull();
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(3);
    wrapper.unmount();
  });
});
