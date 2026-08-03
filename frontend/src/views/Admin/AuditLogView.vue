<template>
  <div class="scrollable-view">
    <v-card outlined class="pa-4">
      <h3>Audit Logs for {{ studentName }}</h3>

      <v-select v-model="filterAction" :items="actionOptions" item-title="label" item-value="value" />

      <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

      <v-list dense>
        <v-list-item v-for="log in flatLogs" :key="log._id">
          <v-list-item-title>
            <strong>{{ log.action }}</strong> - {{ log.filename }}
          </v-list-item-title>
          <v-list-item-subtitle>
            By {{ log.performedByEmail }} ({{ log.performedByRole }}) at
            {{ formatDate(log.timestamp) }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>

      <div v-if="!loading && !logs.length" class="grey--text text-center mt-4">
        No audit logs found.
      </div>

      <v-pagination
        v-model="page"
        :length="totalPages"
        :total-visible="5"
        class="mt-4"
        circle
        rounded
      />
    </v-card>
  </div>
</template>

<script setup>
  import { ref, computed, watch } from 'vue'
  import client from '@/api/client.js'

  const props = defineProps({
    studentId: { type: String, required: true },
    studentName: { type: String, default: '' },
  })

  const logs = ref([])
  const total = ref(0)
  const page = ref(1)
  const limit = ref(10)
  const filterAction = ref(null)
  const loading = ref(false)
  const showProfileMenu = ref(false)

  const actionOptions = [
    { label: 'All', value: null },
    { label: 'Uploads', value: 'upload' },
    { label: 'Deletes', value: 'delete' },
  ]

  const totalPages = computed(() => Math.ceil(total.value / limit.value))

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }

  function safeString(value) {
    if (value == null) return '-'
    if (typeof value === 'string') return value
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function flattenPerformedBy(performedBy) {
    if (!performedBy) return { email: '-', role: '-' }
    return {
      email: typeof performedBy.email === 'string' ? performedBy.email : '-',
      role: typeof performedBy.role === 'string' ? performedBy.role : '-',
    }
  }

  const flatLogs = computed(() =>
    logs.value.map((log) => {
      const performed = flattenPerformedBy(log.performedBy)

      return {
        _id: log._id,
        action: safeString(log.action).toUpperCase(),
        filename: safeString(log.filename),
        performedByEmail: performed.email,
        performedByRole: performed.role,
        timestamp: log.timestamp,
      }
    })
  )

  async function fetchLogs() {
    if (!props.studentId) {
      logs.value = []
      total.value = 0
      return
    }

    loading.value = true
    try {
      const params = {
        page: page.value,
        limit: limit.value,
        ...(filterAction.value ? { action: filterAction.value } : {}),
      }
      const res = await client.get(`/auditlogs/${props.studentId}`, {
        params,
      })
      logs.value = res.data.logs || []
      total.value = res.data.total || 0
      console.log('Sample filename field:', res.data.logs?.[0]?.filename)
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
      logs.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  watch([page, filterAction], fetchLogs, { immediate: true })
</script>

<style scoped>
  .v-list-item-title {
    font-weight: 600;
  }
</style>
