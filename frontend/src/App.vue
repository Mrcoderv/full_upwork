<template>
  <div id="app">
    <NavBar />
    <ToastNotification />

    <v-alert
      v-if="!isOnline"
      type="warning"
      density="compact"
      class="text-center rounded-0"
      :persistent="true"
    >
      Du är offline. Några funktioner fungerar inte tills anslutningen återställs.
    </v-alert>

    <div class="content" :class="{ 'no-navbar': isLoginPage }">
      <v-app>
        <ErrorBoundary>
          <router-view />
        </ErrorBoundary>
      </v-app>
    </div>
  </div>
</template>

<script>
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import NavBar from './components/NavBar.vue'
  import ToastNotification from './components/ToastNotification.vue'
  import ErrorBoundary from './components/ErrorBoundary.vue'
  import { useNetworkStatus } from '@/composables/useNetworkStatus.js'

  export default {
    components: { NavBar, ToastNotification, ErrorBoundary },
    setup() {
      const route = useRoute()
      const { isOnline } = useNetworkStatus()
      
      const isLoginPage = computed(() => {
        return route.path === '/login'
      })

      return {
        isLoginPage,
        isOnline,
      }
    }
  }
</script>
<style>
  #app {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
  }

  .content {
    margin-top: 7rem;
    min-height: calc(100vh - 7rem);
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
  }

  .content.no-navbar {
    margin-top: 0;
    min-height: 100vh;
  }

  router-view {
    flex-grow: 1;
    width: 100%;
  }
</style>
