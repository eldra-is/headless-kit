<script setup lang="ts">
import { computed, partClass } from '../../utils/scopedClass';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

/**
 * The required mark a label or legend ends with: `*`, `danger`, a 0.125rem start margin and the
 * label's own weight. **Internal**, like `FieldError`: it exists so `FieldWrapper` and `RadioGroup`
 * draw one mark rather than two hand-copied ones. The `requiredMark` part and its `classes` key are
 * the parent's, which is why the parent's `classes` object is handed straight through.
 *
 * The asterisk is decorative: a control's native `required` is what announces it.
 */
const props = defineProps<{
  /** The parent's per-part overrides. Only `requiredMark` is read. */
  classes?: Partial<Record<'requiredMark', string>>;
}>();

const markClass = computed(() => partClass('text-danger ms-0.5', props.classes, 'requiredMark'));
</script>

<template>
  <span
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="requiredMark"
    :class="markClass"
    aria-hidden="true"
    >*</span
  >
</template>
