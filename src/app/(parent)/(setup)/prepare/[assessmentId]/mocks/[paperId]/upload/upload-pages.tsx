"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { sharpnessOf } from "@/domain/attempts";
import type { UploadPageView } from "@/application/queries/print-upload";
import { buttonClassName } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { addPageAction, movePageAction, removePageAction, reorderPagesAction, submitUploadAction, type SubmitState } from "./actions";

/** How sharp a photo is, measured on a small grey copy in the browser. Null when the browser cannot decode it. */
async function measureSharpness(file: File): Promise<number | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(3, Math.round(bitmap.width * scale));
    const height = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const gray = new Float32Array(width * height);
    for (let i = 0; i < gray.length; i += 1) gray[i] = 0.299 * (data[i * 4] as number) + 0.587 * (data[i * 4 + 1] as number) + 0.114 * (data[i * 4 + 2] as number);
    bitmap.close();
    return sharpnessOf(gray, width, height);
  } catch {
    return null;
  }
}

/**
 * The thumbnail grid of the finished paper: pages in order (by the number in the footer when it could be
 * read), each movable, and a note only on a page with a problem. One primary action: submit for marking.
 */
export function UploadPages({
  paperId,
  pages,
  countNote,
  available,
  blocked,
}: {
  paperId: string;
  pages: UploadPageView[];
  countNote: string | null;
  available: boolean;
  blocked: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [submitState, submitAction] = useActionState<SubmitState, FormData>(submitUploadAction.bind(null, paperId), {});
  const choose = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const isPdf = pages.some((page) => page.isPdf);

  async function addFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setError(null);
    const list = [...files];
    for (const [index, file] of list.entries()) {
      setProgress(list.length === 1 ? "Adding the page…" : `Adding page ${index + 1} of ${list.length}…`);
      const body = new FormData();
      body.set("file", file);
      const sharpness = await measureSharpness(file);
      if (sharpness !== null) body.set("sharpness", String(Math.round(sharpness * 10) / 10));
      const result = await addPageAction(paperId, body);
      if (!result.ok) {
        setError(result.error);
        break;
      }
    }
    setProgress(null);
    if (choose.current) choose.current.value = "";
    if (camera.current) camera.current.value = "";
    startTransition(() => router.refresh());
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>): void {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.error) setError(result.error);
      router.refresh();
    });
  }

  function drop(targetId: string): void {
    if (!dragging || dragging === targetId) return;
    const ids = pages.map((page) => page.id).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(targetId), 0, dragging);
    setDragging(null);
    run(() => reorderPagesAction(paperId, ids));
  }

  const busy = progress !== null || pending;

  if (!available) {
    return <p className="text-lg text-ink-soft">Uploading a finished paper isn&apos;t available right now. You can still do the mock on the iPad.</p>;
  }
  if (blocked) return <p className="text-lg text-ink">{blocked}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label data-variant="secondary" className={`${buttonClassName("secondary")} cursor-pointer has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-kaki ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(event) => void addFiles(event.currentTarget.files)} />
          Take a photo
        </label>
        <label data-variant="secondary" className={`${buttonClassName("secondary")} cursor-pointer has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-kaki ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <input
            ref={choose}
            data-choose-pages
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(event) => void addFiles(event.currentTarget.files)}
          />
          Choose photos or a PDF
        </label>
      </div>

      {progress ? (
        <p role="status" className="text-lg text-ink">
          {progress}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-base font-medium text-danger">
          {error}
        </p>
      ) : null}

      {pages.length > 0 ? (
        <ol data-page-grid className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pages.map((page, index) => (
            <li
              key={page.id}
              data-page={page.id}
              data-problem={page.problem?.kind}
              draggable={!isPdf}
              onDragStart={() => setDragging(page.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(page.id)}
              className={`flex flex-col gap-2 rounded-control border-[1.5px] bg-surface p-3 ${page.problem ? "border-warning" : "border-line"}`}
            >
              <span className="text-base font-semibold text-ink">{page.label}</span>
              {page.isPdf ? (
                <div className="flex h-40 items-center justify-center rounded-lg border border-line bg-paper text-lg text-ink-soft">PDF</div>
              ) : (
                // Private picture served through the app after an ownership check, so next/image would only proxy it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.thumbnailUrl} alt={`${page.label} of the finished paper`} className="h-40 w-full rounded-lg border border-line bg-white object-contain" />
              )}
              {page.problem ? <p className="text-base font-medium text-warning-strong">{page.problem.text}</p> : null}
              <div className="flex flex-wrap gap-2">
                {!page.isPdf ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => run(() => movePageAction(paperId, page.id, "earlier"))}
                      aria-label={`Move ${page.label} earlier`}
                      className="min-h-12 min-w-12 rounded-control border-[1.5px] border-line-strong px-3 text-lg font-semibold text-ink disabled:opacity-40"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === pages.length - 1}
                      onClick={() => run(() => movePageAction(paperId, page.id, "later"))}
                      aria-label={`Move ${page.label} later`}
                      className="min-h-12 min-w-12 rounded-control border-[1.5px] border-line-strong px-3 text-lg font-semibold text-ink disabled:opacity-40"
                    >
                      →
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => removePageAction(paperId, page.id))}
                  aria-label={`Remove ${page.label}`}
                  className="min-h-12 rounded-control px-3 text-base font-semibold text-kaki-strong underline underline-offset-4 disabled:opacity-40"
                >
                  {page.problem ? "Retake" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-lg text-ink-soft">No pages yet. Take a photo of each page in order, or choose photos or a PDF you have saved.</p>
      )}

      {countNote ? (
        <p data-count-note className="text-lg text-ink">
          {countNote}
        </p>
      ) : null}
      {pages.some((page) => page.problem) ? (
        <p className="text-base text-ink-soft">You can still submit. Answers we can&apos;t read will come to you as a quick check.</p>
      ) : null}

      <form action={submitAction} className="flex flex-col gap-2">
        <SubmitButton disabled={pages.length === 0 || busy} className="w-full sm:w-auto sm:self-start">
          Submit for marking
        </SubmitButton>
        {submitState.error ? (
          <p role="alert" className="text-base font-medium text-danger">
            {submitState.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
