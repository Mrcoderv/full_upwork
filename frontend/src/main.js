import { createApp } from 'vue'
import App from './App.vue'

import client from '@/api/client.js'
import router from './router/router.js'
import store from './store/store.js'

import '@mdi/font/css/materialdesignicons.css'
import './assets/main.css'

import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import './assets/styles/global.css'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

document.documentElement.lang = 'sv'

if (import.meta.env.DEV) {
  const baseURL = client.defaults.baseURL
  const proxyTarget = typeof __DEV_API_PROXY_TARGET__ !== 'undefined' ? __DEV_API_PROXY_TARGET__ : ''
  const target = baseURL && !baseURL.startsWith('http')
    ? `${window.location.origin}${baseURL} (Vite proxy → ${proxyTarget})`
    : baseURL
  console.info(`[API] Connecting to: ${target}`)
}

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
  },
})

async function bootstrap() {
  const user = store.state.user
  if (user && user.token) {
    client.defaults.headers.common['Authorization'] = `Bearer ${user.token}`
  }

  try {
    await store.dispatch('fetchUser')
  } catch (e) {
    console.error('Error during fetchUser:', e)
  }

  const app = createApp(App)

  app.config.errorHandler = (err, instance, info) => {
    console.error('Unhandled Vue error:', { err, info })
  }

  app.use(router)
  app.use(store)
  app.use(vuetify)
  app.mount('#app')
}

bootstrap()
