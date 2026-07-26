import { reactive } from 'vue'

const state = reactive({
  show: false,
  message: '',
  type: 'info',
  timeout: 5000,
})

let hideTimer = null

export function useToast() {
  function show(message, type = 'info', timeout = 5000) {
    if (hideTimer) clearTimeout(hideTimer)
    state.message = message
    state.type = type
    state.timeout = timeout
    state.show = true
    hideTimer = setTimeout(() => { state.show = false }, timeout)
  }

  return {
    state,
    success: (msg, timeout) => show(msg, 'success', timeout || 4000),
    error: (msg, timeout) => show(msg, 'error', timeout || 7000),
    warning: (msg, timeout) => show(msg, 'warning', timeout || 6000),
    info: (msg, timeout) => show(msg, 'info', timeout || 5000),
    dismiss: () => { state.show = false },
  }
}
