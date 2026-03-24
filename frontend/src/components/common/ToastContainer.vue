<script setup>
import { useToast } from '@/composables/useToast.js'
import Toast from '@/components/common/Toast.vue'

const { toasts, remove } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast-list">
        <Toast
          v-for="toast in toasts"
          :key="toast.id"
          :type="toast.type"
          :title="toast.title"
          :message="toast.message"
          :duration="toast.duration"
          @close="remove(toast.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast-container > * {
  pointer-events: auto;
}

.toast-list-enter-active {
  animation: toast-slide-in 0.35s ease-out;
}

.toast-list-leave-active {
  animation: toast-slide-out 0.25s ease-in;
}

.toast-list-move {
  transition: transform 0.3s ease;
}

@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(100%) rotate(2deg);
  }
  to {
    opacity: 1;
    transform: translateX(0) rotate(-0.3deg);
  }
}

@keyframes toast-slide-out {
  from {
    opacity: 1;
    transform: translateX(0) rotate(-0.3deg);
  }
  to {
    opacity: 0;
    transform: translateX(100%) rotate(2deg);
  }
}
</style>
