import {defineStore} from 'pinia'
import {ref} from 'vue'
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
      return await storiesApi.fetchStory(id)
  }

  async function createStory(payload) {
      return await storiesApi.createStory(payload)
  }

  async function deleteStory(id) {
    const data = await storiesApi.deleteStory(id)
    stories.value = stories.value.filter((s) => s.id !== id)
    return data
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
