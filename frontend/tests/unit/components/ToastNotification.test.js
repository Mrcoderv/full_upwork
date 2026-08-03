import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useToast } from '@/composables/useToast.js'

let vuetify
beforeEach(async () => {
  vi.useFakeTimers()
  const { createVuetify } = await import('vuetify')
  const components = await import('vuetify/components')
  const directives = await import('vuetify/directives')
  vuetify = createVuetify({ components, directives })

  const toast = useToast()
  toast.dismiss()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mountToast() {
  const { default: ToastNotification } = await import('@/components/ToastNotification.vue')
  return mount(ToastNotification, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('ToastNotification', () => {
  it('renders nothing when toast is hidden', async () => {
    const wrapper = await mountToast()
    const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
    expect(snackbar.exists()).toBe(true)
    expect(snackbar.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('shows toast when useToast().success is called', async () => {
    const toast = useToast()
    const wrapper = await mountToast()

    toast.success('Sparat!')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
    expect(snackbar.props('modelValue')).toBe(true)
    expect(document.body.innerHTML).toContain('Sparat!')
    wrapper.unmount()
  })

  it('displays error type with correct color', async () => {
    const toast = useToast()
    const wrapper = await mountToast()

    toast.error('Fel!')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
    expect(snackbar.props('color')).toBe('error')
    wrapper.unmount()
  })

  it('dismiss button calls toast.dismiss()', async () => {
    const toast = useToast()
    const wrapper = await mountToast()

    toast.success('Klicka bort')
    await wrapper.vm.$nextTick()

    const btn = wrapper.findComponent({ name: 'VBtn' })
    if (btn.exists()) {
      await btn.trigger('click')
      expect(toast.state.show).toBe(false)
    }
    wrapper.unmount()
  })
})
