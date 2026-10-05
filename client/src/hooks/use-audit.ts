import { useCallback, useRef, useState } from 'react'
import type { AuditErrorResponse, AuditResponse } from '@/types/audit'

export type AuditState =
  | { status: 'idle' }
  | { status: 'loading'; url: string }
  | { status: 'success'; data: AuditResponse }
  | { status: 'error'; url: string; message: string; detail?: string }

export function useAudit() {
  const [state, setState] = useState<AuditState>({ status: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(async (url: string) => {
    // A new audit cancels the one in flight
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setState({ status: 'loading', url })

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })

      // The Vite proxy answers with a non-JSON error page when the server is down
      const body: unknown = await res.json().catch(() => null)

      if (!res.ok) {
        const err = body as AuditErrorResponse | null
        setState({
          status: 'error',
          url,
          message: err?.error ?? errorForStatus(res.status),
          detail: err?.detail,
        })
        return
      }

      setState({ status: 'success', data: body as AuditResponse })
    } catch (err) {
      if (controller.signal.aborted) return
      setState({
        status: 'error',
        url,
        message: "Couldn't reach the audit server.",
        detail: err instanceof Error ? err.message : undefined,
      })
    }
  }, [])

  return { state, run }
}

// Only used when the response has no JSON body, i.e. it didn't come from our server
function errorForStatus(status: number) {
  // Vite's dev proxy replies with a bare 500 when it can't connect to the server
  if (status >= 500) {
    return "Couldn't reach the audit server. Is it running on port 3001?"
  }
  return `The audit failed (HTTP ${status}).`
}
