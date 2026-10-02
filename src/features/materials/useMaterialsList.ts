import { useCallback, useEffect, useRef, useState } from 'react'

import { getRequestErrorMessage, type PagedResponse } from '../../shared/api'
import { usePolling } from '../../shared/state'
import { MATERIALS_PAGE_SIZE, type MaterialsRepository } from './materialsRepository'
import type { StudyMaterial } from './materialTypes'

type MaterialPage = PagedResponse<StudyMaterial>
type LoadMode = 'foreground' | 'background' | 'mutation'

const emptyPage: MaterialPage = {
  items: [], page: 0, size: MATERIALS_PAGE_SIZE, totalElements: 0, totalPages: 0,
}

export function useMaterialsList(repository: MaterialsRepository) {
  const [data, setData] = useState(emptyPage)
  const [isLoading, setIsLoading] = useState(true)
  const [isStale, setIsStale] = useState(true)
  const [error, setError] = useState<{ message: string; page: number } | null>(null)
  const dataRef = useRef(data)
  const mountedRef = useRef(false)
  const requestRef = useRef<{
    controller: AbortController
    mode: LoadMode
    page: number
  } | null>(null)

  const updateData = useCallback((next: MaterialPage) => {
    dataRef.current = next
    setData(next)
  }, [])

  const loadPage = useCallback(async (page: number, mode: LoadMode = 'foreground') => {
    if (!mountedRef.current) return
    // Serialize clicks/poll ticks; a navigation or successful mutation may supersede a poll.
    if (mode !== 'mutation' && requestRef.current && (
      mode === 'background' || requestRef.current.mode !== 'background'
    )) return

    requestRef.current?.controller.abort()
    const request = { controller: new AbortController(), mode, page }
    requestRef.current = request
    if (mode !== 'background') {
      setIsLoading(true)
      setError(null)
    }
    const isCurrent = () => mountedRef.current &&
      requestRef.current === request && !request.controller.signal.aborted

    try {
      let next = await repository.listPage(page, request.controller.signal)
      if (!isCurrent()) return
      // A deletion (including one in another tab) can remove the current last page.
      const lastPage = Math.max(0, next.totalPages - 1)
      if (page > lastPage) {
        request.page = lastPage
        next = await repository.listPage(lastPage, request.controller.signal)
        if (!isCurrent()) return
      }
      updateData(next)
      setIsStale(false)
      setError((current) => mode !== 'background' || current?.page === next.page ? null : current)
    } catch (cause) {
      if (isCurrent() && mode !== 'background') {
        setError({ message: getRequestErrorMessage(cause), page: request.page })
      }
    } finally {
      if (isCurrent()) {
        requestRef.current = null
        if (mode !== 'background') setIsLoading(false)
      }
    }
  }, [repository, updateData])

  useEffect(() => {
    mountedRef.current = true
    let active = true
    void Promise.resolve().then(() => {
      if (active) void loadPage(0)
    })
    return () => {
      active = false
      mountedRef.current = false
      requestRef.current?.controller.abort()
      requestRef.current = null
    }
  }, [loadPage])

  const pollVisiblePage = useCallback(() => {
    void loadPage(dataRef.current.page, 'background')
  }, [loadPage])
  usePolling(data.items.some((material) => material.status === 'PROCESSING'), pollVisiblePage)

  function uploaded(material: StudyMaterial) {
    if (!mountedRef.current) return
    const current = dataRef.current
    // Reads racing with a mutation may precede or follow its server commit. Do
    // not infer exact totals from them; keep known rows until reconciliation.
    setIsStale(true)
    updateData({
      ...current,
      page: 0,
      items: [material, ...(current.page === 0 ? current.items : [])
        .filter((item) => item.id !== material.id)].slice(0, MATERIALS_PAGE_SIZE),
    })
    void loadPage(0, 'mutation')
  }

  function deleted(id: string) {
    if (!mountedRef.current) return
    const current = dataRef.current
    const targetPage = requestRef.current?.page ?? current.page
    setIsStale(true)
    updateData({ ...current, items: current.items.filter((material) => material.id !== id) })
    // Only the server's post-mutation page metadata can safely decide whether
    // a last page disappeared. loadPage clamps it after that bounded request.
    void loadPage(targetPage, 'mutation')
  }

  function renamed(material: StudyMaterial) {
    if (!mountedRef.current) return
    const current = dataRef.current
    const targetPage = requestRef.current?.page ?? current.page
    setIsStale(true)
    updateData({
      ...current,
      items: current.items.map((item) => item.id === material.id ? { ...item, title: material.title } : item),
    })
    void loadPage(targetPage, 'mutation')
  }

  return {
    data, deleted, error, isLoading, isStale, loadPage, renamed, uploaded,
    refresh: () => void loadPage(dataRef.current.page),
    retry: () => void loadPage(error?.page ?? dataRef.current.page),
  }
}
