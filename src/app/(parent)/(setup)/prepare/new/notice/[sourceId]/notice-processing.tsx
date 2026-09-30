"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
      <ol role="status" aria-live="polite" className="flex flex-col gap-3 text-lg text-ink">
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-kaki text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          </span>
          <span>Uploaded</span>
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin text-kaki" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-semibold">Reading the notice</span>
        </li>
        <li className="flex items-center gap-3 text-ink-soft">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
            <span className="h-3 w-3 rounded-full border-2 border-line" />
          </span>
          <span>Finding Mathematics topics</span>
        </li>
      </ol>
    </>
  );
}
