<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'info',
    validator: (v) => ['success', 'info', 'warning', 'error'].includes(v),
  },
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    required: true,
  },
  duration: {
    type: Number,
    default: 2000,
  },
})

const emit = defineEmits(['close'])

const typeConfig = {
  success: {
    bg: '#DCFCE7',
    border: '#22C55E',
    shadow: '#15803D',
    iconColor: '#22C55E',
    titleColor: '#14532D',
  },
  info: {
    bg: '#E0F2FE',
    border: '#0EA5E9',
    shadow: '#0369A1',
    iconColor: '#0EA5E9',
    titleColor: '#0C4A6E',
  },
  warning: {
    bg: '#FEF9C3',
    border: '#EAB308',
    shadow: '#A16207',
    iconColor: '#EAB308',
    titleColor: '#713F12',
  },
  error: {
    bg: '#FEE2E2',
    border: '#EF4444',
    shadow: '#B91C1C',
    iconColor: '#EF4444',
    titleColor: '#7F1D1D',
  },
}

const config = computed(() => typeConfig[props.type] || typeConfig.info)
</script>

<template>
  <div
    class="toast-item"
    :style="{
      background: config.bg,
      borderColor: config.border,
      boxShadow: `4px 4px 0 ${config.shadow}`,
    }"
  >
    <div class="toast-icon" :style="{ color: config.iconColor }">
      <svg v-if="type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <svg v-else-if="type === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      <svg v-else-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <svg v-else-if="type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>

    <div class="toast-content">
      <div
        v-if="title"
        class="toast-title"
        :style="{ color: config.titleColor }"
      >
        {{ title }}
      </div>
      <div class="toast-message">
        {{ message }}
      </div>
    </div>

    <button class="toast-close" @click="emit('close')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 2.5px solid;
  border-radius: 16px;
  min-width: 280px;
  max-width: 400px;
  transform: rotate(-0.3deg);
}

.toast-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 1px;
}

.toast-icon svg {
  width: 100%;
  height: 100%;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 2px;
}

.toast-message {
  font-family: 'Nunito', sans-serif;
  font-size: 0.875rem;
  color: #57534E;
  line-height: 1.4;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #A8A29E;
  transition: color 0.15s ease;
  margin-top: 2px;
}

.toast-close:hover {
  color: #78716C;
}

.toast-close svg {
  width: 100%;
  height: 100%;
}
</style>
