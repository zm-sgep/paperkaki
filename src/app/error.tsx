"use client";

import { StatusScreen, primaryActionClassName } from "@/components/ui/status-screen";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <StatusScreen
      title="Something went wrong on our side"
      reference={error.digest}
      action={
        <button type="button" onClick={() => retry()} className={primaryActionClassName}>
          Try again
        </button>
      }
    >
      <p>The page could not load.</p>
      <p>Anything you had already saved is safe.</p>
    </StatusScreen>
  );
}
