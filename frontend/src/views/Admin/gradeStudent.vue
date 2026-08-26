<template>
  <div class="scrollable-view">
    <section class="ungraded-section">
      <v-card class="pa-5">
        <v-card-title class="text-h5">📋 Elever med obetygsatta utbildningar</v-card-title>

        <v-alert type="info" class="mb-4" border="start" prominent>
          <v-icon class="me-2">mdi-file-document-edit-outline</v-icon>
          Signera betyg på
          <a href="https://scrive.com" target="_blank" class="text-primary text-decoration-underline">
            Scrive
          </a>
          och lås betyget efter signering.
        </v-alert>

        <div v-if="loading">Laddar...</div>
        <div v-else-if="students.length === 0">Inga obetygsatta elever hittades.</div>
        <v-data-table
          v-if="!loading && flatRows.length"
          :headers="headers"
          :items="flatRows"
          class="elevation-1"
          item-value="refId"
          disable-sort
          dense
        >
          <template #item.grade="{ item }">
            <v-chip v-if="item.grade" color="primary" text-color="white">{{ item.grade }}</v-chip>
            <span v-else class="text-muted">Ej betygsatt</span>
          </template>

          <template #item.actions="{ item }">
            <v-btn
              v-if="!item.grade"
              color="primary"
              size="small"
              class="me-2"
              @click="setGrade(item)"
            >
              Sätt betyg
            </v-btn>
            <v-btn
              v-if="item.grade && !item.locked"
              color="success"
              size="small"
              class="me-2"
              @click="lockGrade(item)"
            >
              Lås betyg
            </v-btn>
            <v-btn
              v-if="item.grade === 'F' && item.locked"
              color="warning"
              size="small"
              @click="goToActionPlan(item)"
            >
              Skapa handlingsplan
            </v-btn>
          </template>
        </v-data-table>

        <v-alert v-else-if="!loading && !flatRows.length" type="info">
          Inga obetygsatta elever hittades.
        </v-alert>

        <v-progress-circular v-else indeterminate color="primary" size="32" />
      </v-card>
    </section>

    <v-dialog v-model="showGradeModal" max-width="600px">
      <v-card>
        <v-card-title>Sätt betyg</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="saveGrade">
            <v-select
              v-model="gradeData.grade"
              :items="['A', 'B', 'C', 'D', 'E', 'F']"
              label="Betyg *"
              required
              color="primary"
              variant="outlined"
            />
            <v-textarea
              v-model="gradeData.reason"
              color="primary"
              variant="outlined"
              label="Motivering *"
              required
            />
            <v-textarea
              v-model="gradeData.comments"
              color="primary"
              variant="outlined"
              label="Kommentar"
            />

            <v-text-field
              v-if="isNationalCourse(gradeData.courseCode)"
              v-model.number="gradeData.npScore"
              label="Nationella prov-poäng *"
              type="number"
              min="0"
              required
              color="primary"
              variant="outlined"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showGradeModal = false">Avbryt</v-btn>
          <v-btn color="primary" :disabled="!canSaveGrade()" @click="saveGrade">Spara betyg</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const headers = ref([
    { title: 'Namn', key: 'name' },
    { title: 'Personnummer', key: 'personalNumber' },
    { title: 'E-post', key: 'email' },
    { title: 'Kurs', key: 'courseName' },
    { title: 'Betyg', key: 'grade' },
    { title: 'Datum', key: 'examDate' },
    { title: 'Åtgärder', key: 'actions', sortable: false },
  ])

  const students = ref([])
  const loading = ref(true)
  const showGradeModal = ref(false)
  const gradeData = ref({ studentId: '', courseId: '', grade: '', comments: '' })

  const router = useRouter()

  const goToActionPlan = (row) => {
    router.push(`/student/${row.studentId}?showActionPlan=true`)
  }

  const flatRows = computed(() =>
    students.value.flatMap((student) =>
      [
        ...student.ungradedEducation,
        ...(student.lockedF || []), // bara om det finns
      ].map((edu) => ({
        ...edu,
        studentId: student.studentId,
        name: student.name,
        personalNumber: student.personalNumber,
        email: student.email,
      }))
    )
  )

  const fetchUngraded = async () => {
    try {
      const response = await client.get('/students/ungraded')
      students.value = response.data
    } catch (err) {
      console.error('Fel vid hämtning:', err)
    } finally {
      loading.value = false
    }
  }

  function isNationalCourse(courseCode) {
    return ['SVE', 'ENG', 'MA'].some((sub) => courseCode && courseCode.startsWith(sub))
  }

  function canSaveGrade() {
    const isNational = isNationalCourse(gradeData.value.courseCode)
    return (
      gradeData.value.grade &&
      gradeData.value.reason &&
      (!isNational || (typeof gradeData.value.npScore === 'number' && gradeData.value.npScore >= 0))
    )
  }

  // När du öppnar modalen, sätt även courseCode!
  const setGrade = (row) => {
    gradeData.value.studentId = row.studentId
    gradeData.value.courseId = row.refId
    gradeData.value.courseCode = row.details?.courseCode ?? '' // <-- Ta med kurskoden!
    gradeData.value.grade = ''
    gradeData.value.reason = ''
    gradeData.value.comments = ''
    gradeData.value.npScore = null
    showGradeModal.value = true
  }

  const saveGrade = async () => {
    try {
      const { studentId, courseId, grade, reason, comments, npScore } = gradeData.value

      // Sending the grade data to the backend
      await client.post('/teacher/save-grade', gradeData.value)

      // ✅ Update only the affected entry in the frontend's student data
      const student = students.value.find((s) => s.studentId === studentId)
      if (student) {
        // Find the education entry that matches the courseId
        const edu = [...(student.ungradedEducation || []), ...(student.lockedF || [])].find(
          (e) => e.refId === courseId
        )

        // If the course is found, update its grade and other details
        if (edu) {
          edu.grade = grade
          edu.reason = reason
          edu.comments = comments
          edu.npScore = npScore
        }
      }

      showGradeModal.value = false // Close the grade modal after the update
    } catch (error) {
      console.error('❌ Error saving grade:', error)
      toast.error('Kunde inte spara betyg.')
    }
  }

  const lockGrade = async (row) => {
    try {
      await client.post(
        '/teacher/lock-grade',
        {
          studentId: row.studentId,
          courseId: row.refId,
        }
      )

      const student = students.value.find((s) => s.studentId === row.studentId)
      if (!student) return

      // 🔍 Save original before removing
      const original = [...(student.ungradedEducation || []), ...(student.lockedF || [])].find(
        (e) => e.refId === row.refId
      )

      // 🗑 Remove from ungradedEducation
      student.ungradedEducation = student.ungradedEducation?.filter((e) => e.refId !== row.refId)

      // ✅ Add to lockedF if needed
      if (original && original.grade === 'F') {
        if (!student.lockedF) student.lockedF = []
        const alreadyExists = student.lockedF.find((e) => e.refId === row.refId)
        if (!alreadyExists) {
          student.lockedF.push({ ...original, locked: true })
        }
      }

      students.value = [...students.value]
    } catch (error) {
      console.error('❌ Error locking grade:', error)
      toast.error('Kunde inte låsa betyg.')
    }
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  onMounted(async () => {
    fetchUngraded()
  })
</script>

<style scoped>
  .ungraded-section {
    padding: 32px;
  }

  .ungraded-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }

  .ungraded-table th,
  .ungraded-table td {
    border: 1px solid #ccc;
    padding: 0.75rem;
    text-align: left;
  }

  .ungraded-table th {
    background-color: #f0f0f0;
  }

  .modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .modal-content {
    width: 400px;
  }

  button {
    margin: 5px;
  }
</style>
