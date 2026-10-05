import { useState, type FormEvent } from 'react'
import { Loader2, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeUrl } from '@/lib/audit'

interface AuditFormProps {
  loading: boolean
  onSubmit: (url: string) => void
}

export function AuditForm({ loading, onSubmit }: AuditFormProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const result = normalizeUrl(value)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(null)
    setValue(result.url)
    onSubmit(result.url)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="https://example.com"
          aria-label="Page URL"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'url-error' : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          className="h-10 flex-1 text-base md:text-sm"
        />
        <Button type="submit" size="lg" disabled={loading} className="h-10 px-4">
          {loading ? <Loader2 className="animate-spin" /> : <ScanSearch />}
          Audit
        </Button>
      </div>
      {error && (
        <p id="url-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
