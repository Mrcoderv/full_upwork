import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useNetworkStatus } from '@/composables/useNetworkStatus.js'

function createTestComponent() {
  return defineComponent({
    setup() {
      const { isOnline } = useNetworkStatus()
      return { isOnline }
    },
    template: '<div>{{ isOnline }}</div>',
  })
}

describe('useNetworkStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes an isOnline ref that responds to online/offline events', async () => {
    const TestComp = createTestComponent()
    const wrapper = mount(TestComp)
    await wrapper.vm.$nextTick()

    // Initial value is true in jsdom (navigator.onLine = true)
    expect(wrapper.vm.isOnline).toBe(true)

    // Dispatch offline → should update
    window.dispatchEvent(new Event('offline'))
    expect(wrapper.vm.isOnline).toBe(false)

    // Dispatch online → should update back
    window.dispatchEvent(new Event('online'))
    expect(wrapper.vm.isOnline).toBe(true)

    wrapper.unmount()
  })

  it('toggles correctly through multiple events', async () => {
    const TestComp = createTestComponent()
    const wrapper = mount(TestComp)
    await wrapper.vm.$nextTick()

    window.dispatchEvent(new Event('offline'))
    expect(wrapper.vm.isOnline).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(wrapper.vm.isOnline).toBe(true)

    window.dispatchEvent(new Event('offline'))
    expect(wrapper.vm.isOnline).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(wrapper.vm.isOnline).toBe(true)

    wrapper.unmount()
  })

  it('multiple useNetworkStatus instances share the same ref', async () => {
    let aRef, bRef
    const CompA = defineComponent({
      setup() {
        const { isOnline } = useNetworkStatus()
        aRef = isOnline
        return { isOnline }
      },
      template: '<div>{{ isOnline }}</div>',
    })
    const CompB = defineComponent({
      setup() {
        const { isOnline } = useNetworkStatus()
        bRef = isOnline
        return { isOnline }
      },
      template: '<div>{{ isOnline }}</div>',
    })

    const wrapperA = mount(CompA)
    const wrapperB = mount(CompB)
    await wrapperA.vm.$nextTick()
    await wrapperB.vm.$nextTick()

    expect(aRef).toBe(bRef)

    window.dispatchEvent(new Event('offline'))
    expect(aRef.value).toBe(false)
    expect(bRef.value).toBe(false)

    wrapperA.unmount()
    wrapperB.unmount()
  })
})
