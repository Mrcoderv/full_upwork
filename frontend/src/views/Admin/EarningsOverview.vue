<template>
  <div class="scrollable-view">
    <div class="earnings-container">
      <h2>Total Earnings: {{ totalEarnings }} kr</h2>

      <h3>Earnings per Municipality</h3>
      <table>
        <thead>
          <tr>
            <th>Municipality</th>
            <th>Earnings</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(amount, municipality) in earningsByMunicipality" :key="municipality">
            <td>{{ municipality }}</td>
            <td>{{ amount }} kr</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'
  import { municipalityPricing } from '@/utils/municipalityPricing'

  const toast = useToast()
  const students = ref([])

  onMounted(async () => {
    try {
      const res = await client.get('/students/earnings')
      students.value = res.data
    } catch (err) {
      toast.error('Kunde inte ladda elevdata.')
    }
  })

  // Calculate total earnings
  const totalEarnings = computed(() => {
    return students.value.reduce((sum, s) => {
      const pricing = municipalityPricing[s.municipality?.type]

      if (!pricing) return sum

      for (const edu of s.education || []) {
        if (!edu.grade) continue
        const grade = edu.grade.toUpperCase()

        if (['A', 'B', 'C', 'D', 'E'].includes(grade)) {
          sum += pricing.AtoE
        } else if (grade === 'F') {
          sum += pricing.F
        } else if (['STRECK', 'AVBROTT'].includes(grade)) {
          sum += pricing.Streck
        }
      }

      return sum
    }, 0)
  })
  // Calculate earnings per municipality

  const earningsByMunicipality = computed(() => {
    const map = {}
    for (const s of students.value) {
      const komm = s.municipality?.type
      const pricing = municipalityPricing[komm]

      if (!komm || !pricing) continue

      for (const edu of s.education || []) {
        if (!edu.grade) continue
        const grade = edu.grade.toUpperCase()

        let value = 0
        if (['A', 'B', 'C', 'D', 'E'].includes(grade)) {
          value = pricing.AtoE
        } else if (grade === 'F') {
          value = pricing.F
        } else if (['STRECK', 'AVBROTT'].includes(grade)) {
          value = pricing.Streck
        }

        map[komm] = (map[komm] || 0) + value
      }
    }
    return map
  })
</script>

<style scoped>
  .earnings-container {
    max-width: 600px;
    margin: auto;
    padding: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }
  th,
  td {
    border: 1px solid #ccc;
    padding: 0.6rem;
    text-align: left;
  }
</style>
