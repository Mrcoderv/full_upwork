<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="maxWidth"
    @update:model-value="v => $emit('update:modelValue', v)"
  >
    <v-card class="confirm-dialog">
      <v-card-title class="confirm-dialog__title">
        <v-icon
          v-if="danger"
          size="20"
          color="error"
          class="confirm-dialog__title-icon"
          aria-hidden="true"
        >
mdi-alert-circle-outline
</v-icon>
        {{ title }}
      </v-card-title>
      <v-card-text class="confirm-dialog__text">{{ message }}</v-card-text>
      <div v-if="$slots.default" class="confirm-dialog__slot">
        <slot />
      </div>
      <v-card-actions class="confirm-dialog__actions">
        <v-spacer />
        <v-btn
          variant="text"
          :disabled="loading"
          @click="$emit('update:modelValue', false)"
        >
          {{ cancelLabel }}
        </v-btn>
        <v-btn
          :color="danger ? 'error' : 'primary'"
          :loading="loading"
          @click="$emit('confirm')"
        >
          {{ confirmLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Bekräfta' },
  cancelLabel: { type: String, default: 'Avbryt' },
  danger: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  maxWidth: { type: [Number, String], default: 420 },
})

defineEmits(['update:modelValue', 'confirm'])
</script>

<style scoped>
.confirm-dialog__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-heading);
  font-weight: var(--font-weight-semibold);
}

.confirm-dialog__title-icon {
  flex-shrink: 0;
}

.confirm-dialog__text {
  color: var(--color-ink-secondary);
}

.confirm-dialog__slot {
  padding: 0 var(--space-4);
}

.confirm-dialog__actions {
  padding: 0 var(--space-4) var(--space-3);
}
</style>
