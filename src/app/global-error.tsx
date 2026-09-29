"use client";

import { StatusScreen, primaryActionClassName } from "@/components/ui/status-screen";
import "./globals.css";

// Replaces the root layout when it fails, so it supplies its own document and styles.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-SG">
      <body>
        <title>PaperKaki</title>
        <StatusScreen
          title="Something went wrong on our side"
          reference={error.digest}
          action={
            <button type="button" onClick={() => retry()} className={primaryActionClassName}>
              Try again
            </button>
          }
        >
          <p>PaperKaki could not load.</p>
          <p>Anything you had already saved is safe.</p>
        </StatusScreen>
      </body>
    </html>
  );
}
