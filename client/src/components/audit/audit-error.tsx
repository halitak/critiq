import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface AuditErrorProps {
  url: string
  message: string
  detail?: string
  onRetry: () => void
}

export function AuditError({ url, message, detail, onRetry }: AuditErrorProps) {
  return (
    <Card role="alert" className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" />
          {message}
        </CardTitle>
        <CardDescription className="break-all">{url}</CardDescription>
      </CardHeader>
      {detail && (
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {detail}
          </pre>
        </CardContent>
      )}
      <CardFooter>
        <Button variant="outline" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      </CardFooter>
    </Card>
  )
}
