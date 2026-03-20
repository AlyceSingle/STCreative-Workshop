import { defineStore } from 'pinia'
import { ref } from 'vue'
import storiesApi from '@/api/stories'

export const useStoriesStore = defineStore('stories', () => {
  const stories = ref([])
  const tags = ref([])
  const pagination = ref({ total: 0, page: 1, limit: 12, totalPages: 1 })
  const loading = ref(false)
  const error = ref(null)
  const activeTag = ref(null)

  async function fetchStories(page = 1, tag = null) {
    loading.value = true
    error.value = null
    try {
      const data = await storiesApi.fetchStories(page, tag)
      stories.value = data.stories
      pagination.value = data.pagination
    } catch (e) {
      error.value = e.message || e
    } finally {
      loading.value = false
    }
  }

  async function fetchTags() {
    try {
      tags.value = await storiesApi.fetchTags()
    } catch {
      tags.value = []
    }
  }

  async function fetchStory(id) {
    try {
      return await storiesApi.fetchStory(id)
    } catch (e) {
      throw new Error(e.message || e || '故事不存在')
    }
  }

  async function createStory(payload) {
    try {
      return await storiesApi.createStory(payload)
    } catch (e) {
      throw new Error(e.message || e || '发布失败')
    }
  }

  async function deleteStory(id) {
    try {
      const data = await storiesApi.deleteStory(id)
      stories.value = stories.value.filter((s) => s.id !== id)
      return data
    } catch (e) {
      throw new Error(e.message || e || '删除失败')
    }
  }

  function setActiveTag(tag) {
    activeTag.value = tag === activeTag.value ? null : tag
  }

  return {
    stories,
    tags,
    pagination,
    loading,
    error,
    activeTag,
    fetchStories,
    fetchTags,
    fetchStory,
    createStory,
    deleteStory,
    setActiveTag,
  }
})
