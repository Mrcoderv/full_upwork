<template>
  <div class="test-course-matching">
    <div class="card">
      <div class="card-header">
        <h5>Testa kursmatchning</h5>
      </div>
      <div class="card-body">
        <div class="form-group">
          <label for="courseName">Kursnamn att matcha:</label>
          <input
            id="courseName"
            v-model="searchCourseName"
            type="text"
            class="form-control"
            placeholder="Ex. Svenska 1, Matematik A, etc."
            @input="searchCourse"
          />
        </div>
        <div class="form-group">
          <label for="threshold">Matchningströskel:</label>
          <input
            id="threshold"
            v-model="threshold"
            type="range"
            min="0.1"
            max="1.0"
            step="0.1"
            class="form-control"
          />
          <span class="threshold-value">{{ threshold }}</span>
        </div>
        <button
          class="btn btn-primary"
          :disabled="!searchCourseName.trim()"
          @click="searchCourse"
        >
          Sök matchning
        </button>
        <div v-if="searchResult" class="search-result">
          <h6>Matchning:</h6>
          <div v-if="searchResult.success" class="match-success">
            <div class="match-info">
              <strong>Kurs:</strong>
              {{ searchResult.match.course.courseName }}
            </div>
            <div class="match-info">
              <strong>Kod:</strong>
              {{ searchResult.match.course.courseCode }}
            </div>
            <div class="match-info">
              <strong>Poäng:</strong>
              {{ searchResult.match.course.coursePoints }}
            </div>
            <div class="match-info">
              <strong>Matchning:</strong>
              {{ (searchResult.match.score * 100).toFixed(1) }}%
            </div>
          </div>
          <div v-else class="match-failure">
            <p>Ingen matchning hittad med denna tröskel.</p>
            <button class="btn btn-outline-primary btn-sm" @click="lowerThreshold">
              Sänk tröskel och försök igen
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../store/store.js'

const searchCourseName = ref('')
const threshold = ref(0.7)
const searchResult = ref(null)

const searchCourse = async () => {
  if (!searchCourseName.value.trim()) return
  try {
    const response = await api.get(
      `/course-match?courseName=${encodeURIComponent(searchCourseName.value)}&threshold=${threshold.value}`
    )
    searchResult.value = response.data
  } catch (error) {
    console.error('Error searching course:', error)
    searchResult.value = { success: false, message: 'Ett fel uppstod vid sökning' }
  }
}

const lowerThreshold = () => {
  threshold.value = Math.max(0.1, threshold.value - 0.1)
  searchCourse()
}
</script>

<style scoped>
.test-course-matching {
  max-width: 600px;
  margin: 2rem auto;
}
.card {
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  padding: 1.5rem;
}
.card-header {
  margin-bottom: 1rem;
}
.threshold-value {
  margin-left: 10px;
  font-weight: bold;
}
.search-result {
  margin-top: 1rem;
}
.match-success {
  color: #2c9316;
}
.match-failure {
  color: #b71c1c;
}
</style> 