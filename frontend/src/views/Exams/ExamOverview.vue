<template>
  <div class="scrollable-view">
    <div v-if="userRole === 'student' || userRole === 'systemadmin' || userRole === 'admin'">
<StudentExamForm />
      </div>


    <div v-if="userRole === 'teacher' || userRole === 'systemadmin' || userRole === 'admin'">
      <ExamAdminTable />
    </div>
    <!-- Om ingen giltig roll -->
    <div v-else>
      <p>Du har inte behörighet att visa denna sida.</p>
    </div>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { useStore } from 'vuex'

  import StudentExamForm from '@/views/Exams/ExamForm.vue'
  import ExamAdminTable from '@/views/Exams/ExamAdminTable.vue'

  const store = useStore()
  const userRole = computed(() => store.getters.userRole || 'guest')
</script>
