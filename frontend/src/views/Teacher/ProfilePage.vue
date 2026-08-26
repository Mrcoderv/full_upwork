<template>
  <div class="scrollable-view">
    <div class="container mt-5">
      <div class="row">
        <div class="col-lg-8 mb-4">
          <div class="card shadow-sm">
            <div class="card-body">
              <h3 class="card-title text-center mb-4">Information</h3>
              <br />
              <p class="card-text text-center">
                <strong>Välkommen till Mindfullearning</strong>
                <br />
                <br />Viktig information kommer visas här
                <br />Just nu har ni tillgång till:
                <br />APL, Slutprov i kalendern och Elever
              </p>
            </div>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="card shadow-sm">
            <div class="card-body">
              <h2 class="card-title mb-4">Att göra</h2>
              <ul class="list-group">
                <li
                  v-for="task in tasks"
                  :key="task._id"
                  class="list-group-item d-flex justify-content-between align-items-center"
                  :class="{ 'list-group-item-success': task.isDone }"
                >
                  <div class="d-flex align-items-center">
                    <input
                      type="checkbox"
                      class="form-check-input me-3"
                      :checked="task.isDone"
                      @change="toggleTaskCompletion(task)"
                    />
                    <p :class="{ 'text-decoration-line-through': task.isDone }" class="mb-0">
                      {{ task.description }}
                    </p>
                  </div>
                  <button class="btn btn-danger btn-sm" @click="deleteTask(task._id)">Ta bort</button>
                </li>
              </ul>
              <div class="mt-3">
                <div class="input-group">
                  <input
                    v-model="newTask"
                    type="text"
                    class="form-control"
                    placeholder="Lägg till en uppgift..."
                    @keyup.enter="addTask"
                  />
                  <button class="btn btn-primary" @click="addTask">Lägg till</button>
                </div>
              </div>
              <div class="text-end mt-4">
                <button class="btn btn-warning btn-sm" @click="deleteAllTasks">
                  Rensa alla uppgifter
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { computed, ref, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useStore } from 'vuex'

  export default {
    name: 'ProfilePage',
    setup() {
      const store = useStore()
      const router = useRouter()

      //  Check if user is logged in, redirect if not
      const isLoggedIn = computed(() => store.getters.isLoggedIn)
      onMounted(() => {
        if (!isLoggedIn.value) {
          router.push('/login')
        }
      })

      //  Fetch tasks from Vuex store
      onMounted(() => {
        store.dispatch('fetchTasks')
      })

      const newTask = ref('')

      //  Use Vuex tasks state
      const tasks = computed(() => store.getters.tasks)

      const addTask = () => {
        if (!newTask.value.trim()) return
        store.dispatch('addTask', newTask.value)
        newTask.value = ''
      }

      const toggleTaskCompletion = (task) => {
        const updatedTask = { ...task, isDone: !task.isDone }
        store.dispatch('updateTask', updatedTask)
      }

      const deleteTask = (taskId) => {
        store.dispatch('deleteTask', taskId)
      }

      const deleteAllTasks = () => {
        store.dispatch('deleteAllTasks')
      }

      return { newTask, tasks, addTask, toggleTaskCompletion, deleteTask, deleteAllTasks }
    },
  }
</script>

<style scoped>
  .card {
    border-radius: 8px;
  }

  .card-title {
    font-size: 1.5rem;
    font-weight: bold;
  }

  .card-text {
    font-size: 1rem;
    line-height: 1.6;
    color: #555;
  }

  .list-group-item-success {
    background-color: #d4edda;
    color: #155724;
  }

  .text-decoration-line-through {
    text-decoration: line-through;
  }

  .btn-danger {
    font-size: 0.8rem;
  }

  .btn-warning {
    font-size: 0.9rem;
  }

  .btn-primary {
    font-size: 0.9rem;
  }

  .input-group .form-control {
    border-radius: 0.25rem;
  }

  .input-group .btn {
    border-radius: 0.25rem;
  }
</style>
