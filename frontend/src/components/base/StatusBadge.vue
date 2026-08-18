<template>
  <span
    v-if="!interactive"
    class="status-badge"
    :class="classes"
    role="status"
  >
    <span class="status-dot" aria-hidden="true" />
    <span class="status-label">{{ label }}</span>
    <v-icon v-if="icon" size="14" class="status-icon" aria-hidden="true">{{ icon }}</v-icon>
    <v-icon v-if="locked === true" size="13" class="status-lock" aria-hidden="true">mdi-lock</v-icon>
    <span v-if="locked === false" class="status-unlocked">Ej låst</span>
    <span v-if="auto" class="status-auto" title="Automatisk status">auto</span>
  </span>
  <button
    v-else
    type="button"
    class="status-badge status-badge--button"
    :class="classes"
    :aria-label="`Ändra status: ${label}`"
    @click="$emit('click')"
  >
    <span class="status-dot" aria-hidden="true" />
    <span class="status-label">{{ label }}</span>
    <v-icon v-if="icon" size="14" class="status-icon" aria-hidden="true">{{ icon }}</v-icon>
    <v-icon v-if="locked === true" size="13" class="status-lock" aria-hidden="true">mdi-lock</v-icon>
    <span v-if="locked === false" class="status-unlocked">Ej låst</span>
    <span v-if="auto" class="status-auto" title="Automatisk status">auto</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  hue: { type: String, default: 'neutral' },
  label: { type: String, required: true },
  icon: { type: String, default: '' },
  auto: { type: Boolean, default: false },
  locked: { type: Boolean, default: null },
  interactive: { type: Boolean, default: false },
})

defineEmits(['click'])

const classes = computed(() => [
  `hue-${props.hue}`,
  {
    'is-auto': props.auto,
    'is-locked': props.locked === true,
    'is-unlocked': props.locked === false,
    'is-interactive': props.interactive,
  },
])
</script>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background-color: var(--hue-tint);
  color: var(--hue-ink);
  border: 1px solid transparent;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  line-height: 1.4;
  white-space: nowrap;
  animation: status-stamp var(--motion-duration) var(--motion-ease);
}

.status-badge--button {
  cursor: pointer;
}

.status-badge--button:hover {
  filter: brightness(0.96);
}

.status-badge--button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.status-badge.is-auto {
  border-style: dashed;
  border-color: var(--hue);
}

.status-badge.is-unlocked {
  background-color: transparent;
  border: 1px dashed var(--hue);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--hue);
  flex-shrink: 0;
}

.status-icon {
  opacity: 0.8;
}

.status-lock {
  opacity: 0.75;
}

.status-auto {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: var(--font-weight-semibold);
  padding: 1px 5px;
  border-radius: var(--radius-pill);
  background-color: var(--hue);
  color: var(--color-surface);
}

.status-unlocked {
  font-size: 11px;
  opacity: 0.85;
}

@keyframes status-stamp {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
