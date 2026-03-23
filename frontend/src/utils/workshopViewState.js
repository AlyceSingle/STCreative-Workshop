const WORKSHOP_VIEW_STATE_KEY = 'workshop_view_state'

function getWorkshopViewStorage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

export function sanitizeWorkshopQuery(query = {}) {
  const nextQuery = {}

  if (query.workshop) {
    nextQuery.workshop = String(query.workshop)
  }

  if (query.q) {
    nextQuery.q = String(query.q)
  }

  if (query.mine === '1' || query.mine === 1 || query.mine === true) {
    nextQuery.mine = '1'
  }

  return nextQuery
}

export function readWorkshopViewState() {
  const storage = getWorkshopViewStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(WORKSHOP_VIEW_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeWorkshopViewState(state = {}) {
  const storage = getWorkshopViewStorage()
  if (!storage) return

  try {
    storage.setItem(WORKSHOP_VIEW_STATE_KEY, JSON.stringify({
      ...state,
      routeQuery: sanitizeWorkshopQuery(state.routeQuery),
    }))
  } catch {
    // 忽略存储失败，避免影响主流程
  }
}

export function buildWorkshopBackRoute(fallbackQuery = {}) {
  const savedState = readWorkshopViewState()
  const savedQuery = sanitizeWorkshopQuery(savedState?.routeQuery || {})
  const explicitQuery = sanitizeWorkshopQuery(fallbackQuery)

  return {
    name: 'workshop',
    query: {
      ...savedQuery,
      ...explicitQuery,
    },
  }
}
