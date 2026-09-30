"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

const POLL_MS = 2000;

/** "Reading the notice…": calm steps, no countdown. Asks how it is going every two seconds. */
export function NoticeProcessing({ sourceId }: { sourceId: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    async function check(): Promise<void> {
      try {
        const response = await fetch(`/api/notice-sources/${sourceId}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { status?: string };
        if (!stopped && (body.status === "succeeded" || body.status === "failed")) router.refresh();
      } catch {
        // A dropped request is fine: the next check tries again.
      }
    }
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router, sourceId]);

  return (
    <>
      <PageHeader title="Reading the notice…" description="This usually takes a few seconds. You can stay on this page." />
      <Card>
        <ol role="status" aria-live="polite" className="flex flex-col gap-4 text-lg text-ink">
          <li className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-kaki text-white">
              <Check className="h-5 w-5" strokeWidth={3.5} />
            </span>
            <span>Uploaded</span>
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-kaki-soft text-kaki">
              <Spinner className="h-5 w-5" />
            </span>
            <span className="font-semibold">Reading the notice</span>
          </li>
          <li className="flex items-center gap-3 text-ink-soft">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-line-strong" />
            </span>
            <span>Finding Mathematics topics</span>
          </li>
        </ol>
      </Card>
    </>
  );
}
