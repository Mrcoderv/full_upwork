<template>
  <div class="empty-state">
    <v-icon v-if="icon" size="40" class="empty-state__icon" aria-hidden="true">{{ icon }}</v-icon>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.actions" class="empty-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'mdi-inbox-outline' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-8) var(--space-6);
  color: var(--color-ink-muted);
}

.empty-state__icon {
  opacity: 0.5;
  margin-bottom: var(--space-3);
}

.empty-state__title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-ink-secondary);
}

.empty-state__description {
  margin: var(--space-1) 0 0;
  max-width: 28rem;
  font-size: var(--font-size-base);
  color: var(--color-ink-muted);
}

.empty-state__actions {
  margin-top: var(--space-4);
}
</style>
