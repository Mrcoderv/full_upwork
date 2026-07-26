<template>
  <div v-if="error" class="error-boundary pa-4">
    <v-alert type="error" variant="tonal" closable @click:close="error = null">
      <v-alert-title>Något gick fel</v-alert-title>
      <p>Sidan kunde inte laddas korrekt. Försök igen eller återvänd till startsidan.</p>
      <v-btn variant="tonal" size="small" class="mt-2" @click="$router.push('/')">
        Till startsidan
      </v-btn>
    </v-alert>
  </div>
  <slot v-else />
</template>

<script setup>
import { onErrorCaptured, ref } from 'vue'

const error = ref(null)
onErrorCaptured((err) => {
  error.value = err
  return false
})
</script>
