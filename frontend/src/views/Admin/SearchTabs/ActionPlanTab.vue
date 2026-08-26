<template>
  <v-card class="elevation-1" rounded="lg">
    <!-- Tabs with bottom border -->
    <v-tabs
      v-model="activeSubTab"
      color="primary"
      background-color="grey-lighten-4"
      grow
      class="border-b"
    >
      <v-tab value="student">📋 Handlingsplan</v-tab>
      <v-tab v-if="isSystemAdmin" value="admin">⚙️ Konfigurera frågemall (Admin)</v-tab>
    </v-tabs>

    <!-- Content with top padding and border -->
    <v-window v-model="activeSubTab" class="pa-4 border-t">
      <v-window-item value="student">
        <ActionPlanQuestions :user-data="effectiveUserData" />
      </v-window-item>
      <v-window-item v-if="isSystemAdmin" value="admin">
        <AdminQuestionTab :user-data="effectiveUserData" />
      </v-window-item>
    </v-window>
  </v-card>
</template>

<script setup>
  import { ref, computed } from 'vue'
  import { useStore } from 'vuex'
  import ActionPlanQuestions from './ActionPlanQuestions.vue'
  import AdminQuestionTab from './ChangeActionPlan.vue'

  const props = defineProps({
    userData: { type: Object, default: null },
    student: { type: Object, default: null },
  })

  const effectiveUserData = computed(() => props.userData || props.student || {})

  const store = useStore()
  const userRole = computed(() => store.getters.userRole || 'guest')
  const isSystemAdmin = computed(() => store.getters.isSystemAdmin || userRole.value === 'systemadmin')

  const activeSubTab = ref('student')
</script>

<style scoped>
  .border-b {
    border-bottom: 1px solid #ccc;
  }
  .border-t {
    border-top: 1px solid #ccc;
  }
</style>
