<template>
  <header class="page-header">
    <nav v-if="crumbs && crumbs.length" class="page-header__crumbs" aria-label="Brödsmulor">
      <template v-for="(crumb, i) in crumbs" :key="i">
        <router-link
          v-if="crumb.to"
          class="page-header__crumb page-header__crumb--link"
          :to="crumb.to"
        >
          {{ crumb.label }}
        </router-link>
        <span v-else class="page-header__crumb page-header__crumb--current">{{ crumb.label }}</span>
        <span v-if="i < crumbs.length - 1" class="page-header__crumb-sep" aria-hidden="true">/</span>
      </template>
    </nav>
    <div class="page-header__row">
      <div class="page-header__titles">
        <h1 class="page-header__title">{{ title }}</h1>
        <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  crumbs: { type: Array, default: () => [] },
})
</script>

<style scoped>
.page-header {
  margin-bottom: var(--space-6);
}

.page-header__crumbs {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-ink-muted);
  margin-bottom: var(--space-2);
}

.page-header__crumb--link {
  color: var(--color-primary);
  text-decoration: none;
}

.page-header__crumb--link:hover {
  text-decoration: underline;
}

.page-header__crumb--current {
  color: var(--color-ink-secondary);
}

.page-header__crumb-sep {
  color: var(--color-border-strong);
}

.page-header__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.page-header__title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  line-height: 1.25;
}

.page-header__subtitle {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-base);
  color: var(--color-ink-muted);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
</style>
