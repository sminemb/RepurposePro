import { loadWebConfig } from "@repurposepro/config";
import { ArrowUpRight, Check, Database, Layers3, Radio, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const foundations = [
  {
    description: "Next.js 16, Tailwind CSS v4, and shadcn/ui are configured and ready.",
    icon: Layers3,
    title: "Web foundation",
  },
  {
    description: "NestJS exposes versioned liveness and dependency-readiness checks.",
    icon: Radio,
    title: "API foundation",
  },
  {
    description: "PostgreSQL and Redis connections are shared by the API and local worker.",
    icon: Database,
    title: "Worker foundation",
  },
] as const;

export default function HomePage() {
  const config = loadWebConfig();

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-80 max-w-5xl bg-rp-primary/10 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between border-b border-rp-border/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-rp-md border border-rp-primary/40 bg-rp-primary-soft text-sm font-bold text-rp-primary shadow-rp-glow">
              RP
            </div>
            <span className="text-sm font-semibold tracking-tight text-rp-text">RepurposePro</span>
          </div>

          <Badge
            variant="outline"
            className="border-rp-success/30 bg-rp-success-soft text-rp-success"
          >
            <Check data-icon="inline-start" /> VS0 ready
          </Badge>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div>
            <Badge className="mb-6 border-rp-primary/30 bg-rp-primary-soft text-rp-primary">
              <Sparkles data-icon="inline-start" /> Foundation online
            </Badge>

            <h1 className="max-w-3xl text-4xl leading-[1.05] font-bold tracking-[-0.04em] text-rp-text sm:text-6xl lg:text-7xl">
              Turn one long video into your next wave of content.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-rp-text-muted sm:text-lg">
              RepurposePro&apos;s core platform is ready for the first product slice. The web app,
              API, worker, PostgreSQL, and Redis now share one typed, verifiable foundation.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                className="h-11 bg-rp-primary px-5 text-rp-text shadow-rp-glow hover:bg-rp-primary-hover"
                render={<a href="/signup" />}
              >
                Create your workspace <ArrowUpRight data-icon="inline-end" />
              </Button>
              <span className="text-sm text-rp-text-disabled">Environment: {config.appEnv}</span>
            </div>
          </div>

          <Card className="border border-rp-border bg-rp-card/90 py-0 shadow-rp-panel backdrop-blur">
            <CardHeader className="border-b border-rp-border px-6 py-5">
              <CardTitle className="text-rp-text">Bootable platform</CardTitle>
              <CardDescription className="text-rp-text-muted">
                The minimum infrastructure needed for VS1.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 sm:p-5">
              {foundations.map(({ description, icon: Icon, title }) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-rp-lg border border-rp-border bg-rp-surface p-4"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-rp-md bg-rp-primary-soft text-rp-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-rp-text">{title}</h2>
                    <p className="mt-1 text-sm leading-5 text-rp-text-muted">{description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-col gap-2 border-t border-rp-border/80 pt-5 text-xs text-rp-text-disabled sm:flex-row sm:items-center sm:justify-between">
          <span>Metadata first. Render later.</span>
          <span>Next: authentication and protected dashboard</span>
        </footer>
      </div>
    </main>
  );
}
