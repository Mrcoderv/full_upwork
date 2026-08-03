<template>
  <v-snackbar
    v-model="toast.state.show"
    :color="colorMap[toast.state.type]"
    :timeout="toast.state.timeout"
    location="top right"
    multi-line
  >
    {{ toast.state.message }}
    <template #actions>
      <v-btn variant="text" @click="toast.dismiss()">Stäng</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup>
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const colorMap = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
}
</script>
