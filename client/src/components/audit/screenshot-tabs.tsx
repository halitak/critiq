import { Monitor, Smartphone } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AuditResponse } from '@/types/audit'

export function ScreenshotTabs({ url, screenshots }: Pick<AuditResponse, 'url' | 'screenshots'>) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="screenshots-heading">
      <h2 id="screenshots-heading" className="text-lg font-semibold">
        Screenshots
      </h2>
      <Tabs defaultValue="desktop">
        <TabsList>
          <TabsTrigger value="desktop">
            <Monitor /> Desktop
          </TabsTrigger>
          <TabsTrigger value="mobile">
            <Smartphone /> Mobile
          </TabsTrigger>
        </TabsList>
        <TabsContent value="desktop">
          <img
            src={`data:image/jpeg;base64,${screenshots.desktop}`}
            alt={`Desktop screenshot of ${url} at 1440×900`}
            className="w-full rounded-lg border bg-muted"
          />
        </TabsContent>
        <TabsContent value="mobile">
          <img
            src={`data:image/jpeg;base64,${screenshots.mobile}`}
            alt={`Mobile screenshot of ${url} at 390×844`}
            className="mx-auto w-full max-w-[390px] rounded-2xl border bg-muted"
          />
        </TabsContent>
      </Tabs>
    </section>
  )
}
