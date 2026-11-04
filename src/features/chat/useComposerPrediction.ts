import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AuthenticatedRawRequest } from '../auth'
import { isComposerPredictionReady, requestComposerPrediction, type PredictionTarget } from './composerPrediction'

export function useComposerPrediction({ request, sessionId, scope, target, empty, blocked, enabled }: {
  request?: AuthenticatedRawRequest; sessionId: string; scope: string; target?: PredictionTarget; empty: boolean; blocked: boolean; enabled: boolean
}) {
  const [suggestion, setSuggestion] = useState<{ scope: string; key: string; generation: number; text: string } | null>(null)
  const active = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const attempted = useRef(new Set<string>())
  const key = target ? JSON.stringify([scope, target.sourceMessageId, target.contextVersion, target.activity]) : ''
  const live = useRef({ key, empty, blocked, enabled })
  const discard = useCallback(() => { generation.current++; active.current?.abort(); active.current = null; setSuggestion(null) }, [])
  useLayoutEffect(() => { live.current = { key, empty, blocked, enabled }; return () => { active.current?.abort() } }, [key, empty, blocked, enabled])
  const sourceMessageId = target?.sourceMessageId
  const contextVersion = target?.contextVersion
  const activity = target?.activity
  useEffect(() => {
    if (!isComposerPredictionReady() || !request || !enabled || !empty || blocked || !key || !sourceMessageId || !contextVersion || !activity || attempted.current.has(key)) return
    attempted.current.add(key)
    if (attempted.current.size > 128) attempted.current.delete(attempted.current.values().next().value!)
    const controller = new AbortController(); active.current = controller
    const inputGeneration = generation.current
    void requestComposerPrediction(request, sessionId, { sourceMessageId, contextVersion, activity }, controller.signal).then(result => {
      if (!controller.signal.aborted && generation.current === inputGeneration && live.current.key === key && live.current.empty && !live.current.blocked && live.current.enabled && result?.suggestion && result.contextVersion === contextVersion) setSuggestion({ scope, key, generation: inputGeneration, text: result.suggestion })
    }).catch(() => { /* Optional prediction never affects the completed learning turn. */ })
    return () => controller.abort()
  }, [request, sessionId, scope, key, sourceMessageId, contextVersion, activity, enabled, empty, blocked])
  useEffect(() => { const hide = () => discard(); window.addEventListener('pagehide', hide); return () => { window.removeEventListener('pagehide', hide); active.current?.abort() } }, [discard])
  function takeSuggestion() {
    const text = suggestion?.key === live.current.key && suggestion.generation === generation.current && live.current.empty && !live.current.blocked && live.current.enabled ? suggestion.text : null
    discard()
    return text
  }
  return { takeSuggestion, suggestion: suggestion?.scope === scope && suggestion.key === key && empty && !blocked && enabled ? suggestion.text : null, discard }
}
