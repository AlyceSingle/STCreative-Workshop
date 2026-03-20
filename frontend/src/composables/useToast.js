import { ref, readonly } from 'vue'

const toasts = ref([])
let toastId = 0

function addToast(options) {
  const id = ++toastId
  const toast = {
    id,
    type: options.type || 'info',
    title: options.title || '',
    message: options.message,
    duration: options.duration ?? 2000,
  }

  toasts.value.push(toast)

  if (toast.duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, toast.duration)
  }

  return id
}

function removeToast(id) {
  const index = toasts.value.findIndex((t) => t.id === id)
  if (index !== -1) {
    toasts.value.splice(index, 1)
  }
}

function success(message, options = {}) {
  return addToast({ ...options, type: 'success', message })
}

function info(message, options = {}) {
  return addToast({ ...options, type: 'info', message })
}

function warning(message, options = {}) {
  return addToast({ ...options, type: 'warning', message })
}

function error(message, options = {}) {
  return addToast({ ...options, type: 'error', message })
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    show: addToast,
    success,
    info,
    warning,
    error,
    remove: removeToast,
  }
}
