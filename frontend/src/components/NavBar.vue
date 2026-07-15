<template>
  <nav class="navbar" v-show="!isLoginPage">
    <div class="nav-container">
      <!-- Logo -->
      <div class="nav-brand">
        <router-link class="navbar-brand" to="/">
          <img src="../assets/mindful_transparent.png" alt="Mindful logo" class="logo" />
        </router-link>
      </div>

      <!-- Search wrapper -->
      <div v-if="canSeeSearch" class="search-wrapper">
        <div class="search-bar-enhanced">
          <div class="search-type" @click="toggleSearchTypeDropdown">
            {{ selectedSearchType }}
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M7 10l5 5 5-5z" />
            </svg>
          </div>

          <input
            v-if="selectedSearchType !== 'Datum'"
            class="search-input"
            type="text"
            v-model="searchQuery"
            @input="handleSearch"
            @focus="handleInputFocus"
            :placeholder="`Sök efter ${selectedSearchType.toLowerCase()}...`"
          />

          <DatePicker
            v-if="selectedSearchType === 'Datum'"
            v-model="selectedDate"
            :format="'yyyy-MM-dd'"
            :placeholder="'Välj datum'"
            @change="handleSearch"
          />

          <div v-if="searchQuery || selectedDate" class="clear-icon" @click="clearSearch">✕</div>
        </div>

        <ul v-if="showSearchTypeDropdown" class="search-type-dropdown">
          <li :class="{ active: selectedSearchType === 'Alla' }" @click="selectSearchType('Alla')">
            Alla
          </li>
          <li
            :class="{ active: selectedSearchType === 'Användare' }"
            @click="selectSearchType('Användare')"
          >
            Användare
          </li>
          <li :class="{ active: selectedSearchType === 'Kurs' }" @click="selectSearchType('Kurs')">
            Kurs
          </li>
          <li
            :class="{ active: selectedSearchType === 'Datum' }"
            @click="selectSearchType('Datum')"
          >
            Datum
          </li>
        </ul>

        <!-- Search results -->
        <div v-if="showResults" class="search-results">
          <ul class="result-list">
            <li
              v-for="result in filteredResults"
              :key="result.id"
              @click="navigateToDetails(result)"
              class="result-item"
            >
              <div class="result-content">
                <div class="result-title">{{ result.name }}</div>
                <div class="result-subtitle">{{ result.extra }}</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Actions -->
      <div class="nav-actions">
        <!-- Profil dropdown för inloggade -->
        <div v-if="isLoggedIn" class="profile-dropdown-wrapper">
          <button class="profile-btn" @click.stop.prevent="toggleProfileMenu">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Min profil
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6,9 12,15 18,9" />
            </svg>
          </button>

          <!-- Profile dropdown -->
          <div v-if="showProfileMenu" class="profile-dropdown" ref="profileDropdown">
            <router-link to="/profile" class="dropdown-item">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Min profil
            </router-link>
            <button @click="logout" class="dropdown-item logout-item">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logga ut
            </button>
          </div>
        </div>

        <!-- Notification icon -->
        <div
          v-if="isLoggedIn && canSeeNotifications"
          class="notification-icon"
          @click="toggleNotificationPanel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span v-if="totalNotifications > 0" class="notis-badge">{{ totalNotifications }}</span>
        </div>

        <!-- Burger menu button -->
        <button
          v-if="isLoggedIn"
          class="burger-btn"
          @click.stop.prevent="toggleMobileMenu"
          aria-label="Öppna meny"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <!-- Login knapp för icke-inloggade -->
        <router-link v-if="!isLoggedIn" to="/login" class="login-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10,17 15,12 10,7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          LOGGA IN
        </router-link>

        <!-- Mobile menu overlay -->
        <div
          v-if="isMobileMenuOpen"
          style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            backdrop-filter: blur(2px);
          "
          @click="closeMobileMenu"
        ></div>

        <!-- Mobile menu -->
        <div
          v-if="isMobileMenuOpen"
          style="
            position: fixed;
            top: 0;
            right: 0;
            width: 320px;
            max-width: 85vw;
            height: 100vh;
            background: white;
            z-index: 9999;
            box-shadow: -5px 0 20px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            border-left: 1px solid #e5e7eb;
            animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          "
        >
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 1.5rem;
              border-bottom: 1px solid #e5e7eb;
              background: #f8fafc;
            "
          >
            <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600; color: #374151">
              Navigation
            </h3>
            <button
              style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 2rem;
                height: 2rem;
                background: none;
                border: none;
                border-radius: 0.375rem;
                color: #6b7280;
                cursor: pointer;
                transition: all 0.2s ease;
              "
              @click="closeMobileMenu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div
            style="
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow-y: auto;
            "
          >
            <ul style="list-style: none; padding: 0; margin: 0">
              <li
                v-for="item in filteredMenuItems"
                :key="item.link"
                style="border-bottom: 1px solid #f3f4f6"
              >
                <router-link
                  :to="item.link"
                  style="
                    display: block;
                    padding: 1rem 1.5rem;
                    color: #374151;
                    text-decoration: none;
                    font-weight: 500;
                    transition: all 0.2s ease;
                  "
                  @click="closeMobileMenu"
                >
                  {{ item.name }}
                </router-link>
              </li>
            </ul>

            <div style="padding: 1.5rem; border-top: 1px solid #e5e7eb; background: #f8fafc">
              <button
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  width: 100%;
                  padding: 0.75rem;
                  background: #fee2e2;
                  color: #dc2626;
                  border: 1px solid #fecaca;
                  border-radius: 0.5rem;
                  font-weight: 500;
                  cursor: pointer;
                  transition: all 0.2s ease;
                "
                @click="logout"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16,17 21,12 16,7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logga ut
              </button>
            </div>
          </div>
        </div>

        <!-- Notification panel -->
        <div v-if="showNotisPanel" class="notification-panel" ref="notisPanel">
          <div class="notis-header">
            <h3>Notifikationer</h3>
            <span class="notis-count">({{ totalNotifications }})</span>
          </div>

          <div class="notis-list">
            <div v-for="notification in notifications" :key="notification._id" class="notis-item">
              <div class="notis-content">
                <span class="notis-type">{{ notification.type }}</span>
                <span class="notis-message">{{ notification.message }}</span>
              </div>
              <div class="notis-actions">
                <button @click="resolveNote(notification._id)" class="resolve-btn">
                  Markera som löst
                </button>
              </div>
            </div>

            <div v-if="notifications.length === 0" class="no-notis">Inga notifikationer</div>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script>
  import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import axios from 'axios'
  import { VueDatePicker as DatePicker } from '@vuepic/vue-datepicker'
  import '@vuepic/vue-datepicker/dist/main.css'
  import NotificationBox from './notificationBox.vue'

  export default {
    components: { DatePicker, NotificationBox },
    setup() {
      const store = useStore()
      const router = useRouter()

      const userRole = computed(() => store.getters.userRole || 'guest') // Default to 'guest' if undefined
      const canSeeNotifications = computed(() =>
        ['teacher', 'admin', 'systemadmin'].includes(userRole.value)
      )

      // Dölja navbar på login-sidan
      const isLoginPage = computed(() => {
        return router.currentRoute.value.path === '/login'
      })

      const notifications = ref([])

      const showNotisPanel = ref(false)
      const notisPanel = ref(null)
      const notificationIcon = ref(null)

      // Notification polling configuration
      const NOTIFICATION_POLL_INTERVAL = 60000 // 60 seconds (increased to avoid rate limiting)
      let notificationPollInterval = null
      let isPollingPaused = false
      // Fix missing properties
      const buildVersion = ref(import.meta.env.VITE_BUILD_VERSION || 'Dev')
      const searchQuery = ref('')
      const searchResults = ref([])
      const showResults = ref(false)
      const showFilters = ref(false)
      const filter = ref('all') // Aktivt filter
      const selectedCourse = ref('')
      const selectedDate = ref(null)
      const allCourses = ref([])
      const showNotification = ref(false)
      const showProfileMenu = ref(false)
      const profileDropdown = ref(null)

      const endDateNotifications = ref([])
      const missingGradeNotifications = ref([])

      const isMobileMenuOpen = ref(false)

      const selectedSearchType = ref('Alla')
      const showSearchTypeDropdown = ref(false)

      const toggleMobileMenu = (event) => {
        event?.preventDefault()
        event?.stopPropagation()
        isMobileMenuOpen.value = !isMobileMenuOpen.value
      }

      const closeMobileMenu = () => {
        isMobileMenuOpen.value = false
      }

      const totalNotifications = computed(() => notifications.value.length)

      const fetchNotifications = async () => {
        // Skip if polling is paused (tab hidden)
        if (isPollingPaused) {
          return
        }

        try {
          console.log('📬 Fetching notifications...')
          const res = await axios.get('/api/notifications', { withCredentials: true })
          console.log('📬 Notifications received:', res.data)
          notifications.value = res.data
        } catch (error) {
          // Handle rate limiting gracefully
          if (error.response?.status === 429) {
            console.warn('⚠️ Rate limited - will retry later')
            // Don't clear notifications on rate limit, just skip this fetch
            return
          }
          console.error('❌ Error fetching notifications:', error)
          // Only clear notifications on non-rate-limit errors
          if (error.response?.status !== 429) {
            notifications.value = []
          }
        }
      }

      // Start polling for notifications
      const startNotificationPolling = () => {
        // Clear any existing interval
        stopNotificationPolling()

        // Only start if user is logged in and can see notifications
        if (isLoggedIn.value && canSeeNotifications.value) {
          // Fetch immediately
          fetchNotifications()

          // Then poll at regular intervals
          notificationPollInterval = setInterval(() => {
            if (!isPollingPaused) {
              fetchNotifications()
            }
          }, NOTIFICATION_POLL_INTERVAL)

          console.log(
            `🔄 Started notification polling (every ${NOTIFICATION_POLL_INTERVAL / 1000}s)`
          )
        }
      }

      // Stop polling for notifications
      const stopNotificationPolling = () => {
        if (notificationPollInterval) {
          clearInterval(notificationPollInterval)
          notificationPollInterval = null
          console.log('⏹️ Stopped notification polling')
        }
      }

      // Handle page visibility changes (pause polling when tab is hidden)
      const handleVisibilityChange = () => {
        if (document.hidden) {
          isPollingPaused = true
          console.log('⏸️ Paused notification polling (tab hidden)')
        } else {
          isPollingPaused = false
          // Immediately fetch when tab becomes visible
          if (isLoggedIn.value && canSeeNotifications.value) {
            fetchNotifications()
          }
          console.log('▶️ Resumed notification polling (tab visible)')
        }
      }

      const resolveNote = async (id) => {
        await axios.put(`/api/notifications/${id}/resolve`, {
          userId: store.getters.userId,
        })
        await fetchNotifications() // uppdatera listan
      }

      const toggleNotificationPanel = (event) => {
        const wasOpen = showNotisPanel.value
        showNotisPanel.value = !showNotisPanel.value

        // Fetch immediately when opening the panel
        if (!wasOpen && showNotisPanel.value && isLoggedIn.value && canSeeNotifications.value) {
          fetchNotifications()
        }
      }

      const navigateToDetails = (result) => {
        showResults.value = false
        searchQuery.value = ''

        // Gå till special vy om det är kurs eller program eller kurspaket
        const courseTypes = ['Kurs', 'Course', 'Program', 'CoursePackage', 'Kursinstans', 'CourseInstance']

        if (courseTypes.includes(result.type)) {
          // Generella kurser (mallar) ska visa alla aktiva kursinstanser
          if (['Kurs', 'Course'].includes(result.type)) {
            router.push({
              path: `/education/${result.id}`,
              query: { type: 'course' },
            })
            return
          }

          // Kursinstanser ska visa instansvyn med elever
          if (['Kursinstans', 'CourseInstance'].includes(result.type)) {
            router.push({
              path: `/education/${result.id}`,
              query: { type: 'instance' },
            })
            return
          }

          // Övriga kursrelaterade typer (t.ex. Program, CoursePackage) använder befintlig vy
          router.push(`/education/${result.id}`)
        } else if (['Elev', 'Student'].includes(result.type)) {
          router.push(`/student/${result.id}`)
        } else {
          router.push(`/detaljer/${result.type}/${result.id}`) // Vanlig vy
        }
      }

      const hasPermission = (role) => store.getters.hasPermission(role)

      const isLoggedIn = computed(() => store.getters.isLoggedIn)

      // Check if user role is "teacher" or higher
      const canSeeSearch = computed(() => {
        const allowedRoles = ['teacher', 'syv', 'specped', 'coordinator', 'admin', 'systemadmin']
        return isLoggedIn.value && allowedRoles.includes(userRole.value)
      })

      const logout = () => {
        store.dispatch('logout')
        router.push('/')
      }

      const selectSearchType = (type) => {
        selectedSearchType.value = type
        showSearchTypeDropdown.value = false
        handleSearch()
      }

      const toggleSearchTypeDropdown = () => {
        showSearchTypeDropdown.value = !showSearchTypeDropdown.value
      }

      const handleSearch = async () => {
        console.log('🔍 Starting search with type:', selectedSearchType.value)
        console.log('📝 Search query:', searchQuery.value)
        console.log('📅 Selected date:', selectedDate.value)
        try {
          const params = new URLSearchParams()
          const isDateSearch = selectedSearchType.value === 'Datum'

          if (isDateSearch) {
            if (!selectedDate.value || isNaN(new Date(selectedDate.value).getTime())) {
              searchResults.value = []
              showResults.value = false
              return
            }
            const date = new Date(selectedDate.value)
            const formattedDate = date.toISOString().split('T')[0]
            params.append('type', 'Datum')
            params.append('date', formattedDate)
          } else if (
            selectedSearchType.value === 'Alla' &&
            searchQuery.value &&
            /^\d{4}-\d{2}-\d{2}$/.test(searchQuery.value)
          ) {
            // If 'Alla' and input matches yyyy-mm-dd, treat as date search
            params.append('type', 'Datum')
            params.append('date', searchQuery.value)
          } else {
            if (!searchQuery.value || searchQuery.value.length < 3) {
              searchResults.value = []
              showResults.value = false
              return
            }
            params.append('type', selectedSearchType.value)
            params.append('q', searchQuery.value)
          }

          console.log(
            '🌐 Search URL:',
            `${import.meta.env.VITE_API_URL}/api/search?${params.toString()}`
          )

          const res = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/search?${params.toString()}`,
            { withCredentials: true }
          )
          console.log('✅ Search response:', res.data)
          searchResults.value = res.data
          showResults.value = res.data.length > 0
          console.log('📊 Show results:', showResults.value, 'Results count:', res.data.length)
        } catch (err) {
          console.error('Sökfel:', err)
          searchResults.value = []
          showResults.value = false
        }
      }

      const handleInputFocus = () => {
        if (searchQuery.value && searchQuery.value.length >= 3) {
          showResults.value = true
        }
      }

      // Reagera på datumändring om "Datum" är aktivt
      watch(selectedDate, (val) => {
        if (selectedSearchType.value === 'Datum' && val) {
          handleSearch()
        }
      })

      const filteredResults = computed(() => {
        const type = selectedSearchType.value
        if (type === 'Alla') return searchResults.value

        if (type === 'Användare') {
          return searchResults.value.filter((res) =>
            ['Användare', 'Lärare', 'Personal', 'Elev'].includes(res.type)
          )
        }

        if (type === 'Kurs') {
          return searchResults.value.filter((res) =>
            ['Course', 'Program', 'CoursePackage', 'Kurs'].includes(res.type)
          )
        }

        if (type === 'Datum') {
          return searchResults.value.filter((res) => res.type === 'Elev')
        }

        return searchResults.value.filter((res) => res.type === type)
      })

      const clearSearch = () => {
        searchQuery.value = ''
        selectedDate.value = null
        searchResults.value = []
        showResults.value = false
      }

      const fetchCourses = async () => {
        try {
          const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/courses`)
          allCourses.value = res.data
        } catch (err) {
          console.error('❌ Kunde inte hämta kurser:', err)
        }
      }

      const setFilter = (f) => (filter.value = f)
      const openSearchPanel = () => {
        showResults.value = true
        fetchCourses()
      }

      // Remove these from main nav bar and add to secret menu
      const secretMenuNames = [
        'Utbildning',
        'TEST',
        'Student Inskrivningar',
        'Elev+',
        'PDF',
        'Prövningar',
        'Earnings',
        'Stats',
      ]
      const menuItems = [
        { name: 'Betygsrapporter', link: '/admin/betygsrapporter', role: ['admin', 'systemadmin'] },
        { name: 'Rapporter & Analys', link: '/admin/analytics', role: ['admin', 'systemadmin'] },
        { name: 'APL', link: '/apl', role: ['admin', 'teacher', 'coordinator'] },
        {
          name: 'Kalender',
          link: '/kalender',
          role: ['teacher', 'syv', 'specped', 'admin', 'systemadmin'],
        },
        { name: 'SYV Samtal', link: '/syv/appointments', role: ['syv', 'admin', 'systemadmin'] },
        { name: 'Specped Samtal', link: '/specped/appointments', role: ['specped', 'admin', 'systemadmin'] },
        { name: 'Kurspaket', link: '/programsandpackages', role: 'admin' },
        { name: 'Kurser', link: '/programsandcourses', role: 'admin' },
        { name: 'Kursinstanser', link: '/course-instances', role: 'admin' },
        { name: 'Kursmatchning', link: '/course-matching', role: 'admin' },
        { name: 'Lägg till Lärare', link: '/lagg-till-larare', role: 'admin' },
        { name: 'Lärarhantering', link: '/teacher-management', role: 'admin' },
        { name: 'Elever', link: '/students', role: ['admin', 'teacher'] },
        { name: 'Kurser (Lärarvy)', link: '/larare/kurser', role: 'teacher' },
        { name: 'Lägg till elev manuellt', link: '/manual-add-student', role: 'admin' },
        { name: 'Betyg', link: '/betyg', role: 'teacher' },
        { name: 'Hantera Prövningar', link: '/provningar', role: 'admin' },
        { name: 'Prövningar', link: '/examform', role: 'student' },
      ]
      const filteredMenuItems = computed(() => {
        if (!isLoggedIn.value) return []
        const userRole = store.getters.userRole
        const isAdmin = store.getters.isAdmin
        console.log('🔍 Filtering menu items. User role:', userRole, 'User data:', store.state.user)
        const filtered = menuItems.filter((item) => {
          if (secretMenuNames.includes(item.name)) return false
          if (!item.role) return true
          
          // Admins and systemadmins can see all menus
          if (isAdmin) return true
          
          // Special handling for SYV Samtal and Specped Samtal - only show to exact role
          if (item.name === 'SYV Samtal') {
            return userRole === 'syv'
          }
          if (item.name === 'Specped Samtal') {
            return userRole === 'specped'
          }
          
          // For all other items, use the standard permission check
          const hasPerm = hasPermission(item.role)
          console.log(`  - ${item.name}: hasPermission(${JSON.stringify(item.role)}) = ${hasPerm}`)
          return hasPerm
        })
        console.log(
          '✅ Filtered menu items:',
          filtered.map((i) => i.name)
        )
        return filtered
      })
      const secretMenuItems = computed(() => {
        return menuItems.filter((item) => {
          if (!secretMenuNames.includes(item.name)) return false
          if (!item.role) return true
          return hasPermission(item.role)
        })
      })
      const toggleProfileMenu = (event) => {
        event?.preventDefault()
        event?.stopPropagation()
        showProfileMenu.value = !showProfileMenu.value
      }

      // Close profile menu and notis panel when clicking outside
      const handleClickOutside = (event) => {
        // Profile dropdown
        if (showProfileMenu.value) {
          if (
            profileDropdown.value &&
            !profileDropdown.value.contains(event.target) &&
            !event.target.closest('.profile-icon')
          ) {
            showProfileMenu.value = false
          }
        }
        // Notis panel
        if (showNotisPanel.value) {
          if (
            notisPanel.value &&
            !notisPanel.value.contains(event.target) &&
            !event.target.closest('.notification-icon')
          ) {
            showNotisPanel.value = false
          }
        }
      }
      // Watch for user login to start/stop polling
      watch(
        isLoggedIn,
        (loggedIn) => {
          if (loggedIn && canSeeNotifications.value) {
            console.log('👤 User logged in, starting notification polling...')
            startNotificationPolling()
          } else {
            stopNotificationPolling()
            notifications.value = []
          }
        },
        { immediate: true }
      )

      // Watch for role changes that affect notification visibility
      watch(canSeeNotifications, (canSee) => {
        if (canSee && isLoggedIn.value) {
          startNotificationPolling()
        } else {
          stopNotificationPolling()
        }
      })

      onMounted(() => {
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Start polling if user is already logged in
        if (isLoggedIn.value && canSeeNotifications.value) {
          startNotificationPolling()
        }
      })

      onBeforeUnmount(() => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        stopNotificationPolling()
      })

      const showSecretMenu = ref(false)
      const versionRef = ref(null)
      const secretMenuStyle = computed(() => {
        if (!showSecretMenu.value || !versionRef.value) return {}
        // Position dropdown below the version number, relative to nav
        const navRect = versionRef.value.closest('nav').getBoundingClientRect()
        const rect = versionRef.value.getBoundingClientRect()
        return {
          position: 'absolute',
          top: `${rect.bottom - navRect.top + 8}px`,
          left: `${rect.left - navRect.left}px`,
          zIndex: 3000,
        }
      })
      const toggleSecretMenu = () => {
        showSecretMenu.value = !showSecretMenu.value
      }

      return {
        totalNotifications,
        isMobileMenuOpen,
        toggleMobileMenu,
        toggleSearchTypeDropdown,
        endDateNotifications,
        missingGradeNotifications,
        notifications,
        showNotisPanel,
        toggleNotificationPanel,
        canSeeNotifications,
        buildVersion,
        filter,
        filteredResults,
        handleSearch,
        handleInputFocus,
        searchQuery,
        showResults,
        showFilters,
        searchResults,
        isLoggedIn,
        logout,
        filteredMenuItems,
        secretMenuItems,
        showSecretMenu,
        toggleSecretMenu,
        navigateToDetails,
        setFilter,
        selectedCourse,
        allCourses,
        fetchCourses,
        selectedDate,
        showNotification,
        totalNotifications,
        resolveNote,
        notifications,
        showNotisPanel,
        showProfileMenu,
        toggleProfileMenu,
        profileDropdown,
        selectedSearchType,
        showSearchTypeDropdown,
        selectSearchType,
        clearSearch,
        notisPanel,
        notificationIcon,
        versionRef,
        secretMenuStyle,
        canSeeSearch,
        userRole,
        isLoginPage,
        isMobileMenuOpen,
        toggleMobileMenu,
        closeMobileMenu,
      }
    },
  }
</script>

<style scoped>
  /* Navbar */

  .logo-version-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 0;
    gap: 24px;
  }

  .logo-container {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
  }
  .navbar {
    background: white;
    font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    border-bottom: 1px solid #e5e7eb;
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 2rem;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    min-height: 5rem;
    gap: 2rem;
  }

  /* Logo */
  .nav-brand {
    display: flex;
    align-items: center;
    justify-self: start;
  }

  .navbar-brand {
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
  }

  .navbar-brand:hover {
    transform: scale(1.05);
  }

  .logo {
    height: 2.5rem;
    width: auto;
  }

  .version-badge {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    background: var(--color-bg-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .version-badge:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  /* Sökruta exakt till vänster */
  .search-container {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .search-bar {
    display: flex;
    align-items: center;
    background: #ece6f0;
    padding: 10px 15px;
    border-radius: 30px;
    width: 500px;
  }

  .search-bar input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 16px;
    width: 100%;
  }

  .search-bar button {
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .search-results {
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 50px;
    position: absolute;
    top: 75px;
    width: 900px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .filter-buttons {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 10px;
  }

  .filter-buttons button {
    background: #f0f0f0;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    flex: 1;
    text-align: center;
    font-size: 14px;
  }

  .filter-buttons button.active {
    background: #6c63ff;
    color: white;
  }

  .result-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .result-item {
    padding: 15px;
    border-bottom: 1px solid #ddd;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    text-align: left;
  }

  .result-item:hover {
    background: #f5f5f5;
  }

  .result-title {
    font-weight: bold;
    font-size: 16px;
  }

  .result-subtitle {
    font-size: 14px;
    color: gray;
  }

  .logo {
    height: 50px;
  }

  /* Actions */
  .nav-actions {
    display: flex;
    align-items: center;
    gap: 2rem;
    position: relative;
    justify-self: end;
  }

  /* Burger button */
  .burger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: #f8fafc;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
    order: 2; /* Ensure it appears after profile button */
    position: relative;
    z-index: 100;
    pointer-events: auto;
  }

  .burger-btn:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
    transform: scale(1.05);
  }

  .burger-btn:active {
    transform: scale(0.95);
  }

  /* Notification icon */
  .notification-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: #f8fafc;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .notification-icon:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
    transform: scale(1.05);
  }

  .notification-icon:active {
    transform: scale(0.95);
  }

  .notis-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #dc2626;
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    border: 2px solid white;
  }

  /* Notification panel */
  .notification-panel {
    position: absolute;
    top: 100%;
    right: 0;
    width: 350px;
    max-height: 400px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    overflow: hidden;
  }

  .notis-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
  }

  .notis-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
  }

  .notis-count {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .notis-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .notis-item {
    padding: 1rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .notis-item:last-child {
    border-bottom: none;
  }

  .notis-content {
    margin-bottom: 0.5rem;
  }

  .notis-type {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: #667eea;
    text-transform: uppercase;
    margin-bottom: 0.25rem;
  }

  .notis-message {
    display: block;
    font-size: 0.875rem;
    color: #374151;
    line-height: 1.4;
  }

  .notis-actions {
    display: flex;
    gap: 0.5rem;
  }

  .resolve-btn,
  .reset-btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .resolve-btn {
    background: #10b981;
    color: white;
    border: none;
  }

  .resolve-btn:hover {
    background: #059669;
  }

  .reset-btn {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .reset-btn:hover {
    background: #e5e7eb;
  }

  .no-notis {
    padding: 2rem;
    text-align: center;
    color: #6b7280;
    font-style: italic;
  }

  /* Profile button för inloggade */
  .profile-dropdown-wrapper {
    position: relative;
    order: 1; /* Ensure it appears before burger button */
  }

  .profile-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #f8fafc;
    color: #374151;
    border: 1px solid #d1d5db;
    padding: 0.875rem 1.5rem;
    border-radius: 50px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
  }

  .profile-btn:hover {
    background: #667eea;
    color: white;
    border-color: #667eea;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }

  .profile-btn:active {
    transform: translateY(0);
  }

  .nav-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: var(--color-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .nav-icon:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-color: var(--color-primary);
    transform: scale(1.05);
  }

  .notification-badge {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    background: var(--color-error);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 9999px;
    line-height: 1;
    z-index: 10;
    min-width: 1.25rem;
    text-align: center;
  }

  /* Ej använd längre - enkel navbar */

  .nav-link {
    display: block;
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .nav-link:hover,
  .nav-link.router-link-active {
    color: var(--color-primary);
    background: var(--color-primary-light);
  }

  /* Logout Button - Styled to Match Links */
  .logout-btn {
    appearance: none;
    border: none;
    background: none;
    font-size: 1rem;

    color: blue;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: color 0.3s, background 0.3s;
  }

  .logout-btn:hover {
    background: blue;
    color: white;
  }

  .notification-panel {
    position: absolute;
    top: 3.5rem;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    width: 20rem;
    max-width: 90vw;
    padding: 1rem;
    box-shadow: var(--shadow-lg);
    z-index: 1200;
    font-family: inherit;
  }

  .notis-header {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #333;
  }

  .notis-empty {
    color: #999;
    font-style: italic;
    font-size: 14px;
    text-align: center;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 10px 0;
  }

  .notis-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #f44336;
    color: white;
    font-size: 12px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 999px;
    line-height: 1;
  }

  /* Sök */
  .search-wrapper {
    flex: 1;
    max-width: 600px;
    position: relative;
    justify-self: center;
  }

  .search-bar-enhanced {
    display: flex;
    align-items: center;
    background: var(--color-bg);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 0.75rem 1rem;
    box-shadow: var(--shadow-sm);
    gap: 0.75rem;
    transition: all 0.2s ease;
  }

  .search-bar-enhanced:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }

  .search-type {
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    user-select: none;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .search-type:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 15px;
  }

  .clear-icon {
    cursor: pointer;
    font-size: 18px;
    color: #aaa;
  }

  .search-type-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    margin-top: 5px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    border: 1px solid #ccc;
    padding: 0;
    z-index: 1100;
    list-style: none;
  }

  .search-type-dropdown li {
    padding: 10px 18px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    border-radius: 8px;
    margin: 4px 8px;
    font-size: 15px;
    color: #222;
    background: transparent;
  }

  .search-type-dropdown li:hover {
    background: #ece6f0;
    color: #6c63ff;
  }

  .search-type-dropdown li.active {
    background: #6c63ff;
    color: #fff;
  }

  .search-bar {
    background: #fff;
    border: 1px solid #ddd;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
    border-radius: 30px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-type-toggle button {
    background-color: #f5f5f5;
    border-radius: 15px;
    padding: 6px 12px;
    border: 1px solid #ccc;
    transition: background 0.2s ease;
  }

  .search-type-toggle button:hover {
    background-color: #e0e0e0;
  }

  .icon-container,
  .icon-wrapper {
    position: relative;
  }

  .notis-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .notis-panel li {
    display: flex;
    align-items: center;
    padding: 6px 0;
    font-size: 14px;
    color: #444;
  }

  .notis-panel input[type='checkbox'] {
    margin-right: 10px;
    transform: scale(1.2);
    accent-color: #6c63ff;
  }

  .icon-container {
    position: relative; /* viktigt! */
  }

  .mobile-menu-btn {
    display: none;
    border: none;
    cursor: pointer;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    padding: 0.5rem;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
    position: relative;
    z-index: 1001;
  }

  .mobile-menu-btn:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  @media (min-width: 769px) {
    .mobile-menu,
    .mobile-overlay {
      display: none !important;
    }
  }

  @media (min-width: 300px) and (max-width: 768px) {
    .mobile-menu,
    .mobile-overlay {
      display: none !important;
    }

    .burger-menu {
      display: none !important;
    }
  }

  /* Responsiv design */
  @media (max-width: 768px) {
    .nav-container {
      padding: 0.75rem 1rem;
      min-height: 4rem;
    }

    .logo {
      height: 2rem;
    }

    .login-btn {
      padding: 0.75rem 1.5rem;
      font-size: 0.8rem;
    }

    .profile-btn {
      padding: 0.75rem 1rem;
      font-size: 0.8rem;
    }
  }

  @media (max-width: 480px) {
    .nav-container {
      padding: 0.5rem 1rem;
    }

    .login-btn {
      padding: 0.625rem 1.25rem;
      font-size: 0.75rem;
    }

    .login-btn svg {
      width: 16px;
      height: 16px;
    }
  }

  .nav-links {
    display: none !important;
  }

  .mobile-menu {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: 80%;
    max-width: 300px;
    background-color: #fff;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
    transform: translateX(100%);
    transition: all 0.3s ease;
    padding: 20px;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    visibility: hidden;
    opacity: 0;
    overflow-y: auto;
  }

  .mobile-menu.open {
    transform: translateX(0); /* Detta visar menyn */
    visibility: visible;
    opacity: 1;
  }

  .mobile-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid #eee;
  }

  .mobile-menu-header h3 {
    margin: 0;
    color: #333;
    font-size: 18px;
  }

  .mobile-menu-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #666;
    padding: 5px;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .mobile-menu-close:hover {
    background: #f0f0f0;
  }

  .mobile-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1500;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
  }

  .mobile-overlay.active {
    opacity: 1;
    visibility: visible;
  }

  .mobile-nav-links {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .mobile-nav-links .nav-link {
    font-size: 16px;
    text-align: left;
    padding: 10px;
    display: block;
    color: #333;
    text-decoration: none;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .mobile-nav-links .nav-link:hover {
    background: #f5f5f5;
  }

  .logout-btn {
    margin-bottom: 20px;
    width: 100%;
    text-align: left;
    color: red;
  }

  /* Mobile menu */
  .mobile-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    background: rgba(255, 0, 0, 0.8) !important;
    z-index: 9998 !important;
  }

  .mobile-menu {
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    width: 320px !important;
    max-width: 85vw !important;
    height: 100vh !important;
    background: red !important;
    z-index: 9999 !important;
    box-shadow: -5px 0 20px rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    flex-direction: column !important;
    border: 5px solid blue !important;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* Hover effects for mobile menu links */
  .mobile-nav-link:hover {
    background: #667eea !important;
    color: white !important;
  }

  .mobile-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f8fafc;
  }

  .mobile-menu-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #374151;
  }

  .mobile-menu-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: none;
    border: none;
    border-radius: 0.375rem;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mobile-menu-close:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .mobile-menu-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow-y: auto;
  }

  .mobile-nav-links {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .mobile-nav-links li {
    border-bottom: 1px solid #f3f4f6;
  }

  .mobile-nav-link {
    display: block;
    padding: 1rem 1.5rem;
    color: #374151;
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .mobile-nav-link:hover {
    background: #667eea;
    color: white;
  }

  .mobile-nav-link.router-link-active {
    background: #e0e7ff;
    color: #667eea;
    border-right: 3px solid #667eea;
  }

  .mobile-menu-footer {
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
    background: #f8fafc;
  }

  .mobile-logout-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem;
    background: #fee2e2;
    color: #dc2626;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mobile-logout-btn:hover {
    background: #fecaca;
    border-color: #f87171;
  }

  .profile-icon {
    position: relative;
  }

  .burger-menu svg {
    stroke: currentColor;
    stroke-width: 2;
    transition: stroke 0.2s;
    width: 24px;
    height: 24px;
  }
  .burger-menu:hover svg {
    stroke: #6c63ff;
  }

  .profile-dropdown {
    position: absolute;
    top: 3.5rem;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    z-index: 1200;
    min-width: 12rem;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--color-text);
    background: transparent;
    border: none;
    outline: none;
    padding: 0.75rem 1rem;
    text-align: left;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    text-decoration: none;
  }

  .dropdown-item:hover,
  .dropdown-item:focus {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  .logout-item {
    color: var(--color-error);
    border-top: 1px solid var(--color-border);
    margin-top: 0.25rem;
    padding-top: 0.75rem;
  }

  .logout-item:hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-error);
  }

  .auth-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 16px;
  }
  .login-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #667eea;
    color: white;
    padding: 0.875rem 2rem;
    border-radius: 50px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.875rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    border: 2px solid transparent;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  .login-btn:hover {
    background: #5a67d8;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    transform: translateY(-2px);
  }

  .login-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }
  .register-btn {
    background: #ece6f0;
    color: #6c63ff;
    padding: 8px 18px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: 600;
    transition: background 0.2s;
  }
  .register-btn:hover {
    background: #dcd4e6;
  }
  .navbar-auth-buttons {
    /* position: absolute; top: 20px; right: 40px; z-index: 2000; */
    position: static !important;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 16px;
  }
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 0;
    gap: 24px;
  }
  .logo-version-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-version-group .logo {
    height: 44px;
  }
  .logo-version-group .build-counter {
    font-size: 1.1rem;
    color: #6c63ff;
    font-weight: 600;
  }
  .secret-menu-dropdown {
    background: #fffbe6 !important; /* debug yellow */
    border: 1.5px solid #6c63ff;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 10px 20px;
    min-width: 200px;
    z-index: 3000;
  }
  .secret-menu-dropdown ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .secret-menu-dropdown li {
    margin-bottom: 8px;
  }
  .secret-menu-dropdown li:last-child {
    margin-bottom: 0;
  }
  /* Navbar styling moved to main styles above */
</style>
