<template>
  <div class="scrollable-view">
    <h3 class="page-title">Användare och åtkomstbehörigheter</h3>

    <div class="search-container">
      <div class="action-links">
        <router-link to="/lagg-till-anvandare" class="text-primary me-3">Lägg till ny användare</router-link>
        <router-link to="/admin/permissions" class="text-primary">Behörighetsöversikt</router-link>
      </div>
      
      <form @submit.prevent="searchUsers">
        <div class="form-grid">
          <div class="form-group">
            <label for="fornamn">Namn</label>
            <input id="fornamn" v-model="filters.name" type="text" class="form-control" placeholder="Namn">
          </div>
          <div class="form-group">
            <label for="email">E-post</label>
            <input id="email" v-model="filters.email" type="text" class="form-control" placeholder="E-post">
          </div>
          <div class="form-group">
            <label for="anvandarnamn">Användarnamn</label>
            <input id="anvandarnamn" v-model="filters.username" type="text" class="form-control" placeholder="Användarnamn">
          </div>
          <div class="form-group">
            <label for="hierarki">Roll</label>
            <select id="hierarki" v-model="filters.role" class="form-select">
              <option value="">Alla roller</option>
              <option value="systemadmin">Systemadmin</option>
              <option value="admin">Admin</option>
              <option value="teacher">Lärare</option>
              <option value="coordinator">Koordinator</option>
              <option value="syv">SYV</option>
              <option value="specped">Specialpedagog</option>
              <option value="student">Elev</option>
            </select>
          </div>
        </div>
        
        <div class="mt-3">
          <button type="submit" class="btn btn-success" :disabled="loading">
            {{ loading ? 'Söker...' : 'Sök' }}
          </button>
          <button type="button" class="btn btn-secondary ms-2" @click="resetFilters">Rensa</button>
        </div>
      </form>
    </div>

    <!-- Results Table -->
    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
      {{ errorMessage }}
    </v-alert>

    <div v-if="loading" class="py-6">
      <v-progress-linear indeterminate color="primary" aria-label="Söker efter användare" />
    </div>

    <div v-else-if="users.length > 0" class="results-container">
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Namn</th>
            <th>Användarnamn</th>
            <th>E-post</th>
            <th>Roller</th>
            <th>Åtgärder</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user._id">
            <td>{{ user.name }}</td>
            <td>{{ user.username }}</td>
            <td>{{ user.email }}</td>
            <td>{{ (user.roles || []).join(', ') }}</td>
            <td>
              <router-link :to="`/admin/edit-user/${user._id}`" class="btn btn-sm btn-primary">Redigera</router-link>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="totalPages > 1" class="pagination">
        <button class="btn btn-sm" :disabled="page <= 1" @click="goToPage(page - 1)">Föregående</button>
        <span class="page-info">Sida {{ page }} av {{ totalPages }}</span>
        <button class="btn btn-sm" :disabled="page >= totalPages" @click="goToPage(page + 1)">Nästa</button>
      </div>
    </div>

    <div v-else-if="searched && !loading" class="no-results">
      Inga användare hittades
    </div>
  </div>
</template>

<script>
import { ref, reactive } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

export default {
  name: 'SearchUser',
  setup() {
    const toast = useToast()
    const users = ref([])
    const loading = ref(false)
    const searched = ref(false)
    const errorMessage = ref('')
    const page = ref(1)
    const totalPages = ref(1)
    
    const filters = reactive({
      name: '',
      email: '',
      username: '',
      role: '',
    })

    const searchUsers = async (pageNum = 1) => {
      loading.value = true
      searched.value = true
      errorMessage.value = ''
      page.value = pageNum
      
      try {
        const params = {
          page: pageNum,
          limit: 25,
        }
        if (filters.name) params.firstName = filters.name
        if (filters.email) params.email = filters.email
        if (filters.username) params.username = filters.username
        if (filters.role) params.role = filters.role
        
        const response = await client.get('/users', { params })
        users.value = response.data.users || []
        const total = parseInt(response.headers['x-total-pages']) || 1
        totalPages.value = total
      } catch (error) {
        users.value = []
        totalPages.value = 1
        errorMessage.value = error.response?.data?.message || 'Kunde inte söka efter användare.'
        toast.error(errorMessage.value)
      } finally {
        loading.value = false
      }
    }

    const goToPage = (p) => searchUsers(p)

    const resetFilters = () => {
      filters.name = ''
      filters.email = ''
      filters.username = ''
      filters.role = ''
      users.value = []
      searched.value = false
      page.value = 1
      totalPages.value = 1
    }

    return {
      users,
      loading,
      searched,
      errorMessage,
      filters,
      page,
      totalPages,
      searchUsers,
      goToPage,
      resetFilters
    }
  }
}
</script>

<style scoped>
.scrollable-view { padding: 20px; max-width: 1200px; margin: 0 auto; }
.page-title { text-align: left; margin-bottom: 20px; }
.search-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
.action-links { text-align: left; margin-bottom: 15px; }
.action-links a { text-decoration: none; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
.form-group { text-align: left; }
.form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
.form-control, .form-select { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; }
.btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; }
.btn-success { background-color: #28a745; color: white; }
.btn-success:hover { background-color: #218838; }
.btn-secondary { background-color: #6c757d; color: white; }
.btn-sm { padding: 4px 10px; font-size: 13px; }
.btn-primary { background-color: #1976d2; color: white; }
.results-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
.table thead th { background-color: #f8f9fa; font-weight: 600; }
.no-results { text-align: center; padding: 40px; color: #666; font-style: italic; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 16px; }
.page-info { font-size: 14px; color: #666; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
