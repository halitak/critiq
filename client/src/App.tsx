import { ScanEye } from 'lucide-react'
import { AuditError } from '@/components/audit/audit-error'
import { AuditForm } from '@/components/audit/audit-form'
import { AuditLoading } from '@/components/audit/audit-loading'
import { AuditResults } from '@/components/audit/audit-results'
import { ModeToggle } from '@/components/theme/mode-toggle'
import { useAudit } from '@/hooks/use-audit'

export default function App() {
  const { state, run } = useAudit()

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <ScanEye className="size-5" />
            Critiq
          </div>
          <ModeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Audit a page</h1>
            <p className="text-muted-foreground">
              Accessibility, contrast, responsive and UX issues, reviewed on desktop and mobile.
            </p>
          </div>
          <AuditForm loading={state.status === 'loading'} onSubmit={run} />
        </div>

        {state.status === 'loading' && <AuditLoading key={state.url} url={state.url} />}
        {state.status === 'error' && (
          <AuditError
            url={state.url}
            message={state.message}
            detail={state.detail}
            onRetry={() => run(state.url)}
          />
        )}
        {state.status === 'success' && <AuditResults data={state.data} />}
      </main>
    </div>
  )
}
