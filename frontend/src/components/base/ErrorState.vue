<template>
  <div class="error-state" role="alert">
    <v-icon
      size="40"
      class="error-state__icon"
      aria-hidden="true"
      color="error"
    >
mdi-alert-circle-outline
</v-icon>
    <h3 class="error-state__title">{{ title }}</h3>
    <p v-if="message" class="error-state__message">{{ message }}</p>
    <div v-if="$slots.actions" class="error-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Något gick fel' },
  message: { type: String, default: '' },
})
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-8) var(--space-6);
  color: var(--color-ink-muted);
}

.error-state__icon {
  opacity: 0.8;
  margin-bottom: var(--space-3);
}

.error-state__title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.error-state__message {
  margin: var(--space-1) 0 0;
  max-width: 28rem;
  font-size: var(--font-size-base);
  color: var(--color-ink-muted);
}

.error-state__actions {
  margin-top: var(--space-4);
}
</style>
