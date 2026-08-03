import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from '@/composables/useToast.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useToast', () => {
  it('shows a success toast', () => {
    const toast = useToast()
    toast.success('Sparat!')
    expect(toast.state.show).toBe(true)
    expect(toast.state.message).toBe('Sparat!')
    expect(toast.state.type).toBe('success')
  })

  it('shows an error toast', () => {
    const toast = useToast()
    toast.error('Fel!')
    expect(toast.state.show).toBe(true)
    expect(toast.state.type).toBe('error')
    expect(toast.state.message).toBe('Fel!')
  })

  it('shows a warning toast', () => {
    const toast = useToast()
    toast.warning('Varning!')
    expect(toast.state.type).toBe('warning')
  })

  it('shows an info toast', () => {
    const toast = useToast()
    toast.info('Info')
    expect(toast.state.type).toBe('info')
  })

  it('auto-dismisses success after 4000ms', () => {
    const toast = useToast()
    toast.success('Done')
    expect(toast.state.show).toBe(true)
    vi.advanceTimersByTime(4000)
    expect(toast.state.show).toBe(false)
  })

  it('auto-dismisses error after 7000ms', () => {
    const toast = useToast()
    toast.error('Oops')
    vi.advanceTimersByTime(7000)
    expect(toast.state.show).toBe(false)
  })

  it('auto-dismisses warning after 6000ms', () => {
    const toast = useToast()
    toast.warning('Watch out')
    vi.advanceTimersByTime(6000)
    expect(toast.state.show).toBe(false)
  })

  it('auto-dismisses info after 5000ms', () => {
    const toast = useToast()
    toast.info('Heads up')
    vi.advanceTimersByTime(5000)
    expect(toast.state.show).toBe(false)
  })

  it('does not dismiss before timeout', () => {
    const toast = useToast()
    toast.success('Not yet')
    vi.advanceTimersByTime(3999)
    expect(toast.state.show).toBe(true)
  })

  it('manual dismiss hides toast immediately', () => {
    const toast = useToast()
    toast.success('Gone')
    expect(toast.state.show).toBe(true)
    toast.dismiss()
    expect(toast.state.show).toBe(false)
  })

  it('replacing an active toast resets the timer', () => {
    const toast = useToast()
    toast.success('First')
    vi.advanceTimersByTime(2000)
    toast.error('Second')
    expect(toast.state.message).toBe('Second')
    expect(toast.state.type).toBe('error')
    // The first timer should be cleared; the second toast should still show at 2000+7000-1
    vi.advanceTimersByTime(6999)
    expect(toast.state.show).toBe(true)
    vi.advanceTimersByTime(1)
    expect(toast.state.show).toBe(false)
  })

  it('accepts custom timeout for success', () => {
    const toast = useToast()
    toast.success('Custom', 1000)
    vi.advanceTimersByTime(999)
    expect(toast.state.show).toBe(true)
    vi.advanceTimersByTime(1)
    expect(toast.state.show).toBe(false)
  })
})
