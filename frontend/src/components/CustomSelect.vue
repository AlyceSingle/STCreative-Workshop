<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true },  // [{ value, label }, ...]
  placeholder: { type: String, default: '请选择' }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)

const selectedLabel = computed(() => {
  if (!props.modelValue) return props.placeholder
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt ? opt.label : props.placeholder
})

function selectOption(value) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="custom-select" :class="{ 'is-open': isOpen }">
    <button type="button" class="select-trigger" @click="toggleDropdown">
      <span class="select-text">{{ selectedLabel }}</span>
      <svg class="select-arrow" :class="{ 'rotate-180': isOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
    
    <Transition name="dropdown">
      <div v-if="isOpen" class="select-dropdown">
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          class="select-option"
          :class="{ 'is-selected': opt.value === modelValue }"
          @click="selectOption(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Transition>
    
    <!-- 点击外部关闭 -->
    <div v-if="isOpen" class="select-backdrop" @click="isOpen = false"></div>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  display: inline-block;
  min-width: 120px;
}

.select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #FFFBF0;
  border: 2px solid #FDBA74;
  border-radius: 12px;
  font-family: 'Nunito', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: #78350F;
  cursor: pointer;
  transition: all 0.15s;
}

.select-trigger:hover {
  background: #FFF7ED;
  box-shadow: 2px 2px 0 #FDBA74;
  transform: translateY(-1px);
}

.custom-select.is-open .select-trigger {
  border-color: #F97316;
  box-shadow: 3px 3px 0 #FDBA74;
}

.select-text {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.select-arrow {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: #F97316;
  transition: transform 0.2s;
}

.select-arrow.rotate-180 {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  z-index: 50;
  background: #FFFBF0;
  border: 2.5px solid #FDBA74;
  border-radius: 12px;
  box-shadow: 4px 4px 0 #FED7AA;
  max-height: 240px;
  overflow-y: auto;
  padding: 0.25rem;
}

.select-option {
  width: 100%;
  display: block;
  text-align: left;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-family: 'Nunito', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: #78350F;
  cursor: pointer;
  transition: all 0.1s;
}

.select-option:hover {
  background: #FFF7ED;
  transform: translateX(2px);
}

.select-option.is-selected {
  background: #F97316;
  color: white;
}

.select-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

/* 下拉动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
