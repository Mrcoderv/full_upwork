import { createStore } from 'vuex'
import axios from 'axios'

// Role hierarchy list (higher index = higher authority)
const ROLE_HIERARCHY = [
  'guest',
  'user',
  'student',
  'coordinator',
  'specped',
  'syv',
  'teacher',
  'admin',
  'systemadmin',
]

// Create an Axios instance with credentials enabled
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api',
  withCredentials: true, // ✅ Ensures cookies are included in requests
})

const store = createStore({
  state: {
    user: null,
    tasks: [],
  },

  getters: {
    isLoggedIn: (state) => !!state.user,
    userRole: (state) => {
      // Support both role (singular) and roles (array) for backward compatibility
      if (state.user?.role) return state.user.role;
      if (state.user?.roles && state.user.roles.length > 0) return state.user.roles[0];
      return 'guest';
    },
    isAdmin: (state) => {
      const role = state.user?.role || (state.user?.roles && state.user.roles[0]) || 'guest';
      return ['admin', 'systemadmin'].includes(role);
    },
    isSystemAdmin: (state) => {
      const role = state.user?.role || (state.user?.roles && state.user.roles[0]) || 'guest';
      return role === 'systemadmin';
    },
    tasks: (state) => state.tasks,

    /**
     * Check if the user has the required role (or higher)
     */
    hasPermission: (state) => (requiredRole) => {
      // Support both role (singular) and roles (array) for backward compatibility
      const userRole = state.user?.role || (state.user?.roles && state.user.roles[0]) || 'guest';
      const userIndex = ROLE_HIERARCHY.indexOf(userRole)
      
      // If user role not found in hierarchy, deny access
      if (userIndex === -1) {
        console.warn(`⚠️ User role "${userRole}" not found in hierarchy`)
        return false
      }

      // Om requiredRole är en array: returnera true om användaren har en av rollerna ELLER har högre roll
      if (Array.isArray(requiredRole)) {
        return requiredRole.some((role) => {
          // Check if user has the exact role
          if (userRole === role) return true
          // Check if user has a higher role in hierarchy (higher index = higher authority)
          const requiredIndex = ROLE_HIERARCHY.indexOf(role)
          if (requiredIndex === -1) {
            console.warn(`⚠️ Required role "${role}" not found in hierarchy`)
            return false
          }
          // User with higher index can access items requiring lower index roles
          return userIndex >= requiredIndex
        })
      }

      // Annars, anta att det är en sträng
      // Check if user has the exact role
      if (userRole === requiredRole) return true
      // Check if user has a higher role in hierarchy (higher index = higher authority)
      const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole)
      if (requiredIndex === -1) {
        console.warn(`⚠️ Required role "${requiredRole}" not found in hierarchy`)
        return false
      }
      // User with higher index can access items requiring lower index roles
      return userIndex >= requiredIndex
    }

  },

  mutations: {
    SET_USER(state, user) {
      // Ensure role is set from roles array if role is missing
      if (user && !user.role && user.roles && user.roles.length > 0) {
        user.role = user.roles[0];
      }
      const roleDisplay = user?.role || (user?.roles && user.roles[0]) || 'guest';
      console.log(`🔹 Vuex: Setting user -> ${roleDisplay}`)
      state.user = user
    },
    LOGOUT(state) {
      console.log('🔹 Vuex: Logging out user')
      state.user = null
      state.tasks = [] // Clear tasks on logout
    },
    SET_TASKS(state, tasks) {
      state.tasks = tasks
    },
    ADD_TASK(state, task) {
      state.tasks.push(task)
    },
    UPDATE_TASK(state, updatedTask) {
      const index = state.tasks.findIndex((task) => task._id === updatedTask._id)
      if (index !== -1) state.tasks[index] = updatedTask
    },
    DELETE_TASK(state, taskId) {
      state.tasks = state.tasks.filter((task) => task._id !== taskId)
    },
    DELETE_ALL_TASKS(state) {
      state.tasks = []
    },
  },

  actions: {
    async login({ dispatch }, credentials) {
      try {
        await api.post('/auth/login', {
          email: credentials.email.trim(),
          password: credentials.password.trim(),
        })

        await dispatch('fetchUser')

        return { success: true, message: 'Login successful' }
      } catch (error) {
        console.error('❌ Login failed:', error.response?.data?.message || error)
        return { success: false, message: error.response?.data?.message || 'Login failed' }
      }
    },
    async fetchUser({ commit }) {
      try {
        const { data } = await api.get('/auth/session') // ← use correct endpoint
        console.log('✅ User authenticated:', data)
        commit('SET_USER', data.user) // must be data.user
      } catch (error) {
        console.error('❌ Failed to fetch current user:', error.response?.data?.message || error)
        if (error.response?.status === 401) {
          commit('LOGOUT')
        }
      }
    },

    async logout({ commit }) {
      try {
        await api.post('/auth/logout')
      } catch (error) {
        console.error('❌ Logout request failed:', error)
      }
      commit('LOGOUT')
    },

    async fetchTasks({ commit }) {
      try {
        const { data } = await api.get('/task')
        commit('SET_TASKS', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to fetch tasks:', error.response?.data || error)

        // Handle session expiration (force logout)
        if (error.response?.status === 401) {
          commit('LOGOUT')
        }
      }
    },

    async addTask({ commit }, description) {
      try {
        const { data } = await api.post('/task', { description })
        commit('ADD_TASK', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to add task:', error.response?.data || error)
      }
    },

    async updateTask({ commit }, task) {
      try {
        const { data } = await api.put(`/task/${task._id}`, task)
        commit('UPDATE_TASK', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to update task:', error.response?.data || error)
      }
    },

    async deleteTask({ commit }, taskId) {
      try {
        await api.delete(`/task/${taskId}`)
        commit('DELETE_TASK', taskId)
      } catch (error) {
        console.error('❌ Vuex: Failed to delete task:', error.response?.data || error)
      }
    },

    async deleteAllTasks({ commit }) {
      try {
        await api.delete('/delalltasks')
        commit('DELETE_ALL_TASKS')
      } catch (error) {
        console.error('❌ Vuex: Failed to delete all tasks:', error.response?.data || error)
      }
    },
  },
})
// Global response interceptor: any 401 from the API means the session has
// expired or was never valid, so proactively log the user out and send them
// to the login page instead of leaving stale/broken state around.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      store.commit('LOGOUT')
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login' &&
        (typeof process === 'undefined' || process.env.NODE_ENV !== 'test')
      ) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default store

// add this to bottom of store.js
export { api }
