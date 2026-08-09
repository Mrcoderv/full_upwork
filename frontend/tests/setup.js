import { vi } from 'vitest'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { config } from '@vue/test-utils'

global.confirm = vi.fn(() => true) // Always return "true" for confirm dialogs

// Mock `ResizeObserver` to prevent crashes (must be a constructable class
// because Vuetify components call `new ResizeObserver(...)`)
global.ResizeObserver = class {
    constructor() {
        this.observe = vi.fn()
        this.unobserve = vi.fn()
        this.disconnect = vi.fn()
    }
}

// Mock `window.alert` to avoid JSDOM errors
global.alert = vi.fn()

// Provide visualViewport because Vuetify expects it
global.visualViewport = {
  width: 0,
  height: 0,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}

// Suppress Vuetify duplicate registration warnings & stack overflow errors
const originalWarn = console.warn
vi.spyOn(console, 'warn').mockImplementation((msg) => {
  if (
    msg.includes('App already provides property with key "Symbol(vuetify:') ||
    msg.includes('Maximum call stack size exceeded')
  ) {
    return
  }
  originalWarn(msg) // Keep other warnings visible
})

// Ensure Vuetify is initialized **only once** globally
if (!global.__vuetify) {
  global.__vuetify = createVuetify({
    components,
    directives,
  })
  config.global.plugins = [global.__vuetify] // ✅ Assign config inside initialization block
}
