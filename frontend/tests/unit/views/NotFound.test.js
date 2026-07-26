import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import NotFound from '@/views/NotFound.vue'

let vuetify

beforeEach(async () => {
  const { createVuetify } = await import('vuetify')
  const components = await import('vuetify/components')
  const directives = await import('vuetify/directives')
  vuetify = createVuetify({ components, directives })
})

describe('NotFound.vue', () => {
  it('renders 404 heading', () => {
    const wrapper = mount(NotFound, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('404')
    wrapper.unmount()
  })

  it('renders Swedish not-found message', () => {
    const wrapper = mount(NotFound, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Sidan hittades inte')
    wrapper.unmount()
  })

  it('renders description text', () => {
    const wrapper = mount(NotFound, {
      global: { plugins: [vuetify] },
    })
    expect(wrapper.text()).toContain('Sidan du söker finns inte')
    wrapper.unmount()
  })

  it('has a link to home', () => {
    const wrapper = mount(NotFound, {
      global: { plugins: [vuetify] },
    })
    const link = wrapper.find('a[href="/"], a[to="/"]')
    // Also check v-btn with to prop
    const btn = wrapper.findComponent({ name: 'VBtn' })
    const hasHomeLink = link.exists() || (btn.exists() && btn.props('to') === '/')
    expect(hasHomeLink).toBe(true)
    wrapper.unmount()
  })
})
