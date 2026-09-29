"use client";

import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

/**
 * A modal built on the native <dialog>, so focus stays inside it, Escape closes it and the page
 * behind cannot be tapped. Content is kept short: a title, a sentence and big buttons. Works with
 * `open` controlled by the parent; `onClose` is called for Escape or a backdrop tap.
 */
export function ModalDialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-2 border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 ${wide ? "max-w-3xl" : "max-w-lg"}`}
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-2xl font-semibold text-ink">{title}</h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** The button row at the foot of a dialog. Put the dominant, safe choice first: it is on top on a phone and at the right on an iPad. */
export function DialogActions({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">{children}</div>;
}
