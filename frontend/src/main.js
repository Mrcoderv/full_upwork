import { createApp } from 'vue'
import App from './App.vue'

import client from '@/api/client.js'
import router from './router/router.js'
import store from './store/store.js'

import '@mdi/font/css/materialdesignicons.css'
import './assets/styles/tokens.css'
import './assets/main.css'

import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import './assets/styles/global.css'
import './assets/styles/bootstrap-bridge.css'
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

// Vuetify theme maps to the design tokens in assets/styles/tokens.css.
// Named status colors (red/green/yellow/blue/purple/grey/gray/orange) are
// registered so existing `color="…"` usage resolves to the shared status
// hue families instead of the Material defaults.
const theme = {
  defaultTheme: 'light',
  themes: {
    light: {
      dark: false,
      colors: {
        primary: '#175083',   // stålblå
        secondary: '#0E6BA8', // hav
        info: '#0E6BA8',      // hav
        success: '#2E7D57',   // gran
        warning: '#B77A0A',   // bärnsten
        error: '#B3261E',     // signalröd
        background: '#F6F7F8',
        surface: '#FFFFFF',
        red: '#B3261E',
        green: '#2E7D57',
        yellow: '#B77A0A',
        blue: '#175083',
        purple: '#6D4FA8',
        orange: '#B77A0A',
        grey: '#6B7480',
        gray: '#6B7480',
        'on-primary': '#FFFFFF',
        'on-secondary': '#FFFFFF',
        'on-info': '#FFFFFF',
        'on-success': '#FFFFFF',
        'on-warning': '#FFFFFF',
        'on-error': '#FFFFFF',
        'on-surface': '#22272E',
        'on-background': '#22272E',
      },
    },
  },
}

const vuetify = createVuetify({
  components,
  directives,
  theme,
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
