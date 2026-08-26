<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Kalender & Prövning Underhåll</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Underhållsverktyg för kalenderhändelser och prövningar.
        </p>
      </v-card>

      <!-- Fix titles -->
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Fixa slutprov-titlar</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Ersätt kursnamn med lärarnamn i slutprov-händelser och slå samman dubbletter.
        </p>
        <v-btn
          size="small"
          color="primary"
          :loading="fixingTitles"
          :disabled="fixResult !== null"
          @click="fixTitles"
        >
          Kör
        </v-btn>
        <v-alert v-if="fixResult" type="success" class="mt-3">{{ fixResult }}</v-alert>
        <v-alert v-if="fixError" type="error" class="mt-3">{{ fixError }}</v-alert>
      </v-card>

      <!-- Cleanup slutprov -->
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Rensa slutprov</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Ta bort overksamma slutprov-händelser.
        </p>
        <v-btn
          size="small"
          color="warning"
          :loading="cleaning"
          :disabled="cleanResult !== null"
          @click="cleanupSlutprov"
        >
          Rensa
        </v-btn>
        <v-alert v-if="cleanResult" type="success" class="mt-3">{{ cleanResult }}</v-alert>
        <v-alert v-if="cleanError" type="error" class="mt-3">{{ cleanError }}</v-alert>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const fixingTitles = ref(false)
const fixResult = ref(null)
const fixError = ref(null)

const cleaning = ref(false)
const cleanResult = ref(null)
const cleanError = ref(null)

const fixTitles = async () => {
  fixingTitles.value = true
  fixResult.value = null
  fixError.value = null
  try {
    const { data } = await client.post('/calendar-events/fix-titles')
    fixResult.value = data.message || 'Titlar fixade.'
    toast.success(fixResult.value)
  } catch (err) {
    fixError.value = 'Kunde inte fixa titlar.'
    toast.error(fixError.value)
  } finally {
    fixingTitles.value = false
  }
}

const cleanupSlutprov = async () => {
  cleaning.value = true
  cleanResult.value = null
  cleanError.value = null
  try {
    const { data } = await client.delete('/calendar-events/cleanup-slutprov')
    cleanResult.value = data.message || 'Slutprov rensade.'
    toast.success(cleanResult.value)
  } catch (err) {
    cleanError.value = 'Kunde inte rensa slutprov.'
    toast.error(cleanError.value)
  } finally {
    cleaning.value = false
  }
}
</script>
