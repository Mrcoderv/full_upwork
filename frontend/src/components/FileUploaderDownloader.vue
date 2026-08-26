<template>
  <div>
    <v-card class="pa-4" outlined>
      <h3>Upload File for {{ studentName }}</h3>
      <v-file-input v-model="selectedFile" label="Choose file" :show-size="true" dense clearable />

      <v-btn
        :disabled="!selectedFile || uploading"
        color="primary"
        class="mt-2"
        @click="uploadFile"
      >
        <v-icon left>mdi-upload</v-icon>
        Upload
      </v-btn>

      <v-progress-linear
        v-if="uploading"
        indeterminate
        color="primary"
        class="my-2"
      ></v-progress-linear>
    </v-card>

    <v-card class="pa-4 mt-4" outlined>
      <h3>Uploaded Files</h3>
      <v-list two-line>
        <v-list-item v-for="file in files" :key="file._id" class="file-item">
          <v-list-item-title>{{ file.filename }}</v-list-item-title>
          <v-list-item-subtitle>
            Uploaded: {{ formatDate(file.uploadedAt || file.uploadDate) }}
          </v-list-item-subtitle>

          <v-list-item-action>
            <v-btn icon :title="'Download ' + file.filename" @click="downloadFile(file._id)">
              <v-icon>mdi-download</v-icon>
            </v-btn>
          </v-list-item-action>

          <v-list-item-action>
            <v-btn
              icon
              color="error"
              :title="'Delete ' + file.filename"
              @click="deleteFile(file._id)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </v-list-item-action>
        </v-list-item>
      </v-list>

      <div v-if="!files.length" class="text-center grey--text">No files uploaded yet.</div>
    </v-card>
  </div>
</template>

<script setup>
  import { ref, watchEffect } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()
  const props = defineProps({
    studentId: {
      type: String,
      required: true,
    },
    studentName: {
      type: String,
      default: '',
    },
  })

  const selectedFile = ref(null)
  const uploading = ref(false)
  const files = ref([])

  async function fetchFiles() {
    try {
      const res = await client.get(`/uploads/${props.studentId}`)
      files.value = res.data
    } catch (e) {
      console.error('Failed to fetch files:', e)
      files.value = []
    }
  }

  async function uploadFile() {
    if (!selectedFile.value) return

    uploading.value = true
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    try {
      await client.post(`/uploads/${props.studentId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      selectedFile.value = null
      await fetchFiles()
    } catch (e) {
      console.error('Upload failed:', e)
      toast.error('Failed to upload file.')
    } finally {
      uploading.value = false
    }
  }
  function getFilenameFromDisposition(disposition = '') {
    let filename = 'download'

    // Try RFC 5987 encoding (filename*=UTF-8'')
    const utf8Regex = /filename\*=UTF-8''([^;]*)/i
    const utf8Match = disposition.match(utf8Regex)
    if (utf8Match && utf8Match[1]) {
      filename = decodeURIComponent(utf8Match[1])
    } else {
      // Fallback to plain filename="..."
      const asciiRegex = /filename="?([^\";]+)"?/i
      const asciiMatch = disposition.match(asciiRegex)
      if (asciiMatch && asciiMatch[1]) {
        filename = asciiMatch[1]
      }
    }
    return filename
  }

  async function downloadFile(fileId) {
    try {
      const res = await client.get(`/uploads/download/${fileId}`, {
        responseType: 'blob',
      })

      const disposition = res.headers['content-disposition'] || ''
      let filename = 'download'

      // RFC 5987 filename* parsing (UTF-8)
      const utf8FilenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
      if (utf8FilenameMatch && utf8FilenameMatch[1]) {
        filename = decodeURIComponent(utf8FilenameMatch[1])
      } else {
        // Fallback to standard filename
        const asciiFilenameMatch = disposition.match(/filename="?([^\";]+)"?/i)
        if (asciiFilenameMatch && asciiFilenameMatch[1]) {
          filename = asciiFilenameMatch[1]
        }
      }

      const blobUrl = window.URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Download failed:', error)
      toast.error('Failed to download file.')
    }
  }

  async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return
    try {
      await client.delete(`/uploads/${fileId}`)
      await fetchFiles()
    } catch (e) {
      console.error('Delete failed:', e)
      toast.error('Failed to delete file.')
    }
  }

  // Load files initially and when studentId changes
  watchEffect(() => {
    if (props.studentId) {
      fetchFiles()
    }
  })

  function formatDate(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
  }
</script>

<style scoped>
  .file-item {
    border-bottom: 1px solid #eee;
  }
</style>
