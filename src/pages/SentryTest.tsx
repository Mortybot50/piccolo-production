import { useState } from "react";
import * as Sentry from "@sentry/react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

/**
 * /__sentry-test — one-click Sentry smoke route.
 *
 * Three buttons, three failure modes:
 *   1. Captured exception (Sentry.captureException) — fires through SDK, does NOT crash UI.
 *   2. Render-time throw — crashes the component subtree, exercises ErrorBoundary + Sentry auto-capture.
 *   3. Unhandled promise rejection — exercises Sentry's global rejection handler.
 *
 * After clicking, check Sentry → Projects → piccolo-production → Issues.
 * Stack traces should be symbolicated (component names + readable line numbers),
 * NOT minified gibberish. If they're minified, the source-map upload step
 * (SENTRY_AUTH_TOKEN / ORG / PROJECT env vars + @sentry/vite-plugin) is broken.
 */
export default function SentryTestPage() {
  const [crashOnRender, setCrashOnRender] = useState(false);

  if (crashOnRender) {
    throw new Error(`Sentry render-crash smoke @ ${new Date().toISOString()}`);
  }

  const fireCapturedException = () => {
    const stamp = new Date().toISOString();
    const err = new Error(`Sentry captureException smoke @ ${stamp}`);
    const eventId = Sentry.captureException(err, {
      tags: { smoke: "captured-exception" },
      extra: { route: "/__sentry-test", stamp },
    });
    toast.success(`Captured. Sentry eventId: ${eventId}`);
  };

  const fireUnhandledRejection = () => {
    const stamp = new Date().toISOString();
    void Promise.reject(new Error(`Sentry unhandled-rejection smoke @ ${stamp}`));
    toast.info("Unhandled rejection fired. Should land in Sentry within ~30s.");
  };

  return (
    <AppShell title="Sentry smoke test">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sentry smoke test</CardTitle>
            <CardDescription>
              Fire a synthetic error and confirm it lands in Sentry with a readable
              stack trace. Use this any time after a deploy to verify source-map
              upload is still working. Safe to run in production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={fireCapturedException}
                className="w-full"
              >
                1. Fire captured exception (no UI crash)
              </Button>
              <p className="text-sm text-stone-500">
                Calls Sentry.captureException. UI stays responsive. Returns an
                event id in the toast — paste that into Sentry's search to jump
                straight to the issue.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={fireUnhandledRejection}
                className="w-full"
              >
                2. Fire unhandled promise rejection
              </Button>
              <p className="text-sm text-stone-500">
                Tests Sentry's global onunhandledrejection handler.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                variant="destructive"
                onClick={() => setCrashOnRender(true)}
                className="w-full"
              >
                3. Crash the component (ErrorBoundary + auto-capture)
              </Button>
              <p className="text-sm text-stone-500">
                Throws during render. Exercises the React error boundary path
                and Sentry's auto-capture. The page will show the boundary
                fallback — refresh to come back.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How to verify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-stone-600">
            <p>
              1. Click any button above.
            </p>
            <p>
              2. Open Sentry → Projects → <code>piccolo-production</code> → Issues.
            </p>
            <p>
              3. Find the matching event (search by the ISO timestamp in the
              error message, or by the eventId from the toast).
            </p>
            <p>
              4. Open the issue. Stack trace should show readable component +
              file names (e.g. <code>SentryTestPage</code>,{" "}
              <code>src/pages/SentryTest.tsx:34</code>). If you see
              minified names like <code>aB.xY:1234</code>, source-map upload is
              broken — check the Vercel build log for the @sentry/vite-plugin
              upload step, and re-verify the three env vars
              (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT).
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
