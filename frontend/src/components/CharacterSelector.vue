<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useWorkshopStore } from '@/stores/workshop'

const props = defineProps({
  modelValue: { type: String, default: '' },
  defaultCharacter: { type: String, default: '' },
  placeholder: { type: String, default: '选择角色卡' }
})

const emit = defineEmits(['update:modelValue'])

const workshopStore = useWorkshopStore()
const isOpen = ref(false)
const searchQuery = ref('')

// 加载角色卡列表
onMounted(async () => {
  if (workshopStore.stConnected && workshopStore.characterList.length === 0) {
    await workshopStore.fetchCharacterList()
  }
})

// 当 ST 连接状态变化时重新加载
watch(() => workshopStore.stConnected, async (connected) => {
  if (connected && workshopStore.characterList.length === 0) {
    await workshopStore.fetchCharacterList()
  }
})

// 过滤后的角色卡列表
const filteredCharacters = computed(() => {
  if (!searchQuery.value.trim()) {
    return workshopStore.characterList
  }
  const query = searchQuery.value.toLowerCase()
  return workshopStore.characterList.filter(char => 
    char.name.toLowerCase().includes(query)
  )
})

// 当前选中的角色卡名称
const selectedLabel = computed(() => {
  if (!props.modelValue) return props.placeholder
  const char = workshopStore.characterList.find(c => c.name === props.modelValue)
  return char ? char.name : props.modelValue
})

// 是否显示默认标记
const isDefaultSelected = computed(() => {
  return props.defaultCharacter && props.modelValue === props.defaultCharacter
})

function selectCharacter(name) {
  emit('update:modelValue', name)
  isOpen.value = false
  searchQuery.value = ''
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
  }
}

function useDefault() {
  if (props.defaultCharacter) {
    emit('update:modelValue', props.defaultCharacter)
    isOpen.value = false
  }
}
</script>

<template>
  <div class="character-selector" :class="{ 'is-open': isOpen }">
    <!-- 触发按钮 -->
    <button type="button" class="selector-trigger" @click="toggleDropdown" :disabled="workshopStore.characterListLoading">
      <div class="trigger-content">
        <!-- 角色头像占位 -->
        <div class="avatar-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div class="trigger-text">
          <span class="selected-name">{{ selectedLabel }}</span>
          <span v-if="isDefaultSelected" class="default-badge">工坊默认</span>
        </div>
      </div>
      <svg 
        v-if="!workshopStore.characterListLoading"
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
      <div v-else class="loading-spinner"></div>
    </button>

    <!-- 下拉面板 -->
    <Transition name="dropdown">
      <div v-if="isOpen" class="selector-dropdown">
        <!-- 搜索框 -->
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input 
            v-model="searchQuery"
            type="text" 
            class="search-input"
            placeholder="搜索角色卡..."
            @click.stop
          />
        </div>

        <!-- 默认选项（如果有） -->
        <button
          v-if="defaultCharacter"
          type="button"
          class="character-option default-option"
          :class="{ 'is-selected': modelValue === defaultCharacter }"
          @click="useDefault"
        >
          <div class="option-avatar default-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div class="option-info">
            <span class="option-name">{{ defaultCharacter }}</span>
            <span class="option-badge">工坊默认角色卡</span>
          </div>
        </button>

        <!-- 分割线 -->
        <div v-if="defaultCharacter && filteredCharacters.length > 0" class="divider"></div>

        <!-- 角色卡列表 -->
        <div class="character-list">
          <div v-if="workshopStore.characterListLoading" class="loading-state">
            <div class="loading-spinner"></div>
            <span>加载角色卡列表...</span>
          </div>
          
          <div v-else-if="filteredCharacters.length === 0" class="empty-state">
            <span v-if="searchQuery">未找到匹配的角色卡</span>
            <span v-else>暂无角色卡</span>
          </div>

          <button
            v-else
            v-for="char in filteredCharacters"
            :key="char.name"
            type="button"
            class="character-option"
            :class="{ 'is-selected': char.name === modelValue }"
            @click="selectCharacter(char.name)"
          >
            <div class="option-avatar">
              <img v-if="char.avatar" :src="char.avatar" :alt="char.name" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div class="option-info">
              <span class="option-name">{{ char.name }}</span>
              <span v-if="char.name === defaultCharacter" class="option-badge">默认</span>
            </div>
          </button>
        </div>
      </div>
    </Transition>

    <!-- 点击外部关闭 -->
    <div v-if="isOpen" class="selector-backdrop" @click="isOpen = false"></div>
  </div>
</template>

<style scoped>
.character-selector {
  position: relative;
  display: block;
  width: 100%;
}

.selector-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  background: #FFFBF0;
  border: 2.5px solid #FDBA74;
  border-radius: 14px;
  font-family: 'Nunito', sans-serif;
  cursor: pointer;
  transition: all 0.15s;
}

.selector-trigger:hover:not(:disabled) {
  background: #FFF7ED;
  box-shadow: 3px 3px 0 #FDBA74;
  transform: translateY(-1px);
}

.selector-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.character-selector.is-open .selector-trigger {
  border-color: #F97316;
  box-shadow: 4px 4px 0 #FDBA74;
}

.trigger-content {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
}

.avatar-placeholder {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFF7ED;
  border: 2px solid #FDBA74;
  border-radius: 50%;
  color: #F97316;
}

.avatar-placeholder svg {
  width: 1.125rem;
  height: 1.125rem;
}

.trigger-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.selected-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #78350F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.default-badge {
  flex-shrink: 0;
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  background: #DCFCE7;
  color: #16A34A;
  border-radius: 999px;
  border: 1.5px solid #22C55E;
}

.select-arrow {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  color: #F97316;
  transition: transform 0.2s;
}

.select-arrow.rotate-180 {
  transform: rotate(180deg);
}

.loading-spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid #FED7AA;
  border-top-color: #F97316;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 下拉面板 */
.selector-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  z-index: 50;
  background: #FFFBF0;
  border: 2.5px solid #FDBA74;
  border-radius: 14px;
  box-shadow: 5px 5px 0 #FED7AA;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 2px dashed #FED7AA;
}

.search-icon {
  width: 1rem;
  height: 1rem;
  color: #A8A29E;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-family: 'Nunito', sans-serif;
  font-size: 0.875rem;
  color: #431407;
  outline: none;
}

.search-input::placeholder {
  color: #A8A29E;
}

/* 分割线 */
.divider {
  height: 1px;
  background: #FED7AA;
  margin: 0.25rem 0.75rem;
}

/* 角色卡列表 */
.character-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.character-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.1s;
  text-align: left;
}

.character-option:hover {
  background: #FFF7ED;
  transform: translateX(2px);
}

.character-option.is-selected {
  background: #F97316;
}

.character-option.is-selected .option-name {
  color: white;
}

.character-option.is-selected .option-avatar {
  border-color: white;
  background: rgba(255,255,255,0.2);
}

.character-option.is-selected .option-avatar svg {
  color: white;
}

.default-option {
  margin: 0.25rem;
  border: 2px dashed #22C55E;
  background: #F0FDF4;
}

.default-option:hover {
  background: #DCFCE7;
}

.default-option.is-selected {
  background: #16A34A;
  border-color: #16A34A;
}

.option-avatar {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFF7ED;
  border: 2px solid #FDBA74;
  border-radius: 50%;
  overflow: hidden;
}

.option-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.option-avatar svg {
  width: 1rem;
  height: 1rem;
  color: #F97316;
}

.default-avatar {
  border-color: #22C55E;
  background: #DCFCE7;
}

.default-avatar svg {
  color: #16A34A;
}

.option-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.option-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #431407;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.option-badge {
  flex-shrink: 0;
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  background: #DCFCE7;
  color: #16A34A;
  border-radius: 999px;
}

.character-option.is-selected .option-badge {
  background: rgba(255,255,255,0.3);
  color: white;
}

/* 空状态和加载状态 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  color: #A8A29E;
  font-size: 0.875rem;
  font-weight: 600;
}

/* 背景遮罩 */
.selector-backdrop {
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
