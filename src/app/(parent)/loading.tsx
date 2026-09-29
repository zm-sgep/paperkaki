export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="h-9 w-2/3 animate-pulse rounded-lg bg-line" />
      <div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-line" />
    </div>
  );
}
