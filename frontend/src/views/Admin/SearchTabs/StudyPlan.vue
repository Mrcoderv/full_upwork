<template>
  <div>
    <div v-for="education in sortedEducation" :key="education._id" class="education-item">
      <div class="info">
        <strong>Kurs:</strong>
        {{ education.name || 'Ingen kursdata' }}
      </div>
      <div class="info">
        <strong>Status:</strong>
        <div v-if="!savedEducations.has(education._id)">
          <select v-model="education.status">
            <option disabled value="">Välj här</option>
            <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div v-else>{{ education.status }}</div>
      </div>
      <div class="actions">
        <button class="btn btn-success" @click="updateStatus(education)">Spara studieplan</button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { computed, reactive } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()
  const savedEducations = reactive(new Set())

  const props = defineProps({
    userData: Object,
  })

  const student = computed(() => props.userData || { education: [] })

  // Sort education: CoursePackages first, then courses chronologically
  const sortedEducation = computed(() => {
    if (!student.value?.education || !Array.isArray(student.value.education)) return [];
    
    return [...student.value.education].sort((a, b) => {
      // First, separate CoursePackages from other types
      const aIsPackage = a.type === 'CoursePackage';
      const bIsPackage = b.type === 'CoursePackage';
      
      // CoursePackages come first
      if (aIsPackage && !bIsPackage) return -1;
      if (!aIsPackage && bIsPackage) return 1;
      
      // If both are CoursePackages, maintain their relative order (or sort by startDate if available)
      if (aIsPackage && bIsPackage) {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(a.startDate) - new Date(b.startDate);
      }
      
      // For courses (non-packages), sort chronologically by startDate
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate) - new Date(b.startDate);
    });
  })

  const statuses = ['Antagen', 'Betygsatt', 'Avbrott', 'Ej påbörjad', 'Reviderad']

  const updateStatus = async (education) => {
    try {
      const refId = typeof education.refId === 'object' ? education.refId._id : education.refId

      const res = await client.put(
        `/students/${student.value._id}/education/${refId}/status`,
        { status: education.status }
      )
      savedEducations.add(education.refId)
    } catch (err) {
      toast.error('Kunde inte uppdatera kursstatus.')
    }
  }
</script>

<style scoped>
  .education-item {
    border: 1px solid #ccc;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 8px;
  }

  .info {
    margin-bottom: 0.5rem;
  }

  .actions {
    margin-top: 0.5rem;
  }

  select {
    min-width: 150px;
    width: 100%;
    box-sizing: border-box;
  }
</style>
