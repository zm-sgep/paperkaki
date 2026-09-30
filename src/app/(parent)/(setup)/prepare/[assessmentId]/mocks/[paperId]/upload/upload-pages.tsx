"use client";

import { Camera, ChevronLeft, ChevronRight, CircleAlert, FileUp, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { sharpnessOf } from "@/domain/attempts";
import type { UploadPageView } from "@/application/queries/print-upload";
import { PaperStack } from "@/components/illustrations";
import { buttonClassName } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
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
    return <Notice>Uploading a finished paper isn&apos;t available right now. You can still do the mock on the iPad.</Notice>;
  }
  if (blocked) return <Notice>{blocked}</Notice>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label data-variant="secondary" className={`${buttonClassName("secondary")} cursor-pointer has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-kaki ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(event) => void addFiles(event.currentTarget.files)} />
          <Camera aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
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
          <FileUp aria-hidden="true" className="h-5 w-5" strokeWidth={2.25} />
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
              className={`flex flex-col gap-3 rounded-card border bg-surface p-3 shadow-card ${page.problem ? "border-coral/60" : "border-line"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <Chip tone={page.problem ? "coral" : "neutral"}>{page.label}</Chip>
              </span>
              {page.isPdf ? (
                <div className="flex h-40 items-center justify-center rounded-xl border border-line bg-paper text-lg font-semibold text-ink-soft">PDF</div>
              ) : (
                // Private picture served through the app after an ownership check, so next/image would only proxy it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.thumbnailUrl} alt={`${page.label} of the finished paper`} className="h-40 w-full rounded-xl border border-line bg-white object-contain" />
              )}
              {page.problem ? (
                <p className="flex items-start gap-2 text-base font-medium text-coral-strong">
                  <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.25} />
                  {page.problem.text}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {!page.isPdf ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() => run(() => movePageAction(paperId, page.id, "earlier"))}
                      aria-label={`Move ${page.label} earlier`}
                      className="flex min-h-12 min-w-12 items-center justify-center rounded-control border-[1.5px] border-line-strong text-ink transition-colors hover:bg-paper disabled:opacity-40"
                    >
                      <ChevronLeft aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === pages.length - 1}
                      onClick={() => run(() => movePageAction(paperId, page.id, "later"))}
                      aria-label={`Move ${page.label} later`}
                      className="flex min-h-12 min-w-12 items-center justify-center rounded-control border-[1.5px] border-line-strong text-ink transition-colors hover:bg-paper disabled:opacity-40"
                    >
                      <ChevronRight aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => removePageAction(paperId, page.id))}
                  aria-label={`Remove ${page.label}`}
                  className="flex min-h-12 items-center gap-1.5 rounded-control px-3 text-base font-semibold text-kaki-strong underline underline-offset-4 hover:bg-kaki-soft disabled:opacity-40"
                >
                  {page.problem ? <RotateCcw aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} /> : <Trash2 aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />}
                  {page.problem ? "Retake" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line-strong bg-surface px-5 py-8 text-center">
          <div aria-hidden="true">
            <PaperStack className="h-24 w-auto" />
          </div>
          <p className="max-w-md text-lg text-ink-soft">No pages yet. Take a photo of each page in order, or choose photos or a PDF you have saved.</p>
        </div>
      )}

      {countNote ? (
        <Notice tone="info" data-count-note>
          <p>{countNote}</p>
        </Notice>
      ) : null}
      {pages.some((page) => page.problem) ? (
        <p className="text-base text-ink-soft">You can still submit. Answers we can&apos;t read will come to you as a quick check.</p>
      ) : null}

      <form action={submitAction} className="flex flex-col gap-2">
        <SubmitButton size="lg" disabled={pages.length === 0 || busy} className="w-full sm:w-auto sm:self-start">
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
