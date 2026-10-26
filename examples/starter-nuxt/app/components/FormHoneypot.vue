<script setup lang="ts">
/**
 * The honeypot of a platform form: a text input named by the form's definition, off-screen and
 * inert so a person never reaches it, and a bot that fills every input does. Its value is sent as
 * `hp` and the platform drops the submission when it is not empty. Renders nothing until the
 * definition names the field.
 */
defineProps<{ name: string | null }>();
const value = defineModel<string>({ default: '' });
</script>

<template>
  <div
    v-if="name"
    aria-hidden="true"
    inert
    class="absolute -left-[10000px] size-px overflow-hidden opacity-0"
  >
    <input v-model="value" type="text" :name="name" tabindex="-1" autocomplete="off" />
  </div>
</template>
