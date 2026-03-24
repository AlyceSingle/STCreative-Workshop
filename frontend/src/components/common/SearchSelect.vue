<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: '请选择' },
  searchPlaceholder: { type: String, default: '搜索...' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const searchQuery = ref('')
const searchInput = ref(null)

const filteredOptions = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.options
  }
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(opt =>
    opt.label.toLowerCase().includes(query) ||
    (opt.value && opt.value.toString().toLowerCase().includes(query))
  )
})

const selectedLabel = computed(() => {
  if (!props.modelValue) return props.placeholder
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt ? opt.label : props.placeholder
})

function selectOption(value) {
  emit('update:modelValue', value)
  isOpen.value = false
  searchQuery.value = ''
}

function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    setTimeout(() => {
      searchInput.value?.focus()
    }, 50)
  }
}

function closeDropdown() {
  isOpen.value = false
  searchQuery.value = ''
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="search-select" :class="{ 'is-open': isOpen, 'is-disabled': disabled }">
    <button
      type="button"
      class="select-trigger"
      :disabled="disabled"
      @click="toggleDropdown"
    >
      <span class="select-text" :class="{ 'is-placeholder': !modelValue }">
        {{ loading ? '加载中...' : selectedLabel }}
      </span>
      <svg
        class="select-arrow"
        :class="{ 'rotate-180': isOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="select-dropdown">
        <div class="search-box">
          <svg
            class="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="search-input"
            :placeholder="searchPlaceholder"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="clear-btn"
            @click="searchQuery = ''"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="options-list">
          <div v-if="filteredOptions.length === 0" class="empty-state">
            {{ searchQuery ? '未找到匹配项' : emptyText }}
          </div>
          <button
            v-for="opt in filteredOptions"
            :key="opt.value"
            type="button"
            class="select-option"
            :class="{ 'is-selected': opt.value === modelValue }"
            @click="selectOption(opt.value)"
          >
            <span class="option-label">{{ opt.label }}</span>
            <svg
              v-if="opt.value === modelValue"
              class="check-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </Transition>

    <div v-if="isOpen" class="select-backdrop" @click="closeDropdown"></div>
  </div>
</template>

<style scoped>
.search-select {
  position: relative;
  display: inline-block;
  min-width: 160px;
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

.select-trigger:hover:not(:disabled) {
  background: #FFF7ED;
  box-shadow: 2px 2px 0 #FDBA74;
  transform: translateY(-1px);
}

.select-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-select.is-open .select-trigger {
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

.select-text.is-placeholder {
  color: #A8A29E;
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
  overflow: hidden;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 2px dashed #FED7AA;
  background: #FFF7ED;
}

.search-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  color: #F97316;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: 'Nunito', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  color: #78350F;
  outline: none;
}

.search-input::placeholder {
  color: #A8A29E;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #A8A29E;
  transition: all 0.15s;
}

.clear-btn:hover {
  background: #FED7AA;
  color: #78350F;
}

.clear-btn svg {
  width: 0.875rem;
  height: 0.875rem;
}

.options-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.25rem;
}

.empty-state {
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: #A8A29E;
}

.select-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
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

.option-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.select-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

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
