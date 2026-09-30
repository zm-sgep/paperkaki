"use client";

import { FileUp, UserRound } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field, inputClassName } from "@/components/ui/field";
import { buttonClassName, type ButtonVariant } from "@/components/ui/button";
import { uploadNoticeAction, type UploadNoticeState } from "./actions";

type Props = {
  /** The parent's children, to choose whose notice it is. Leave out when `childId` is fixed. */
  kids?: { id: string; nickname: string }[];
  selectedChildId?: string | null;
  /** The notice is for this child already (for example after a failed reading): no choosing. */
  childId?: string;
  label: string;
  variant?: ButtonVariant;
  /** A sentence under the button: what can be chosen. */
  hint?: string;
  /** Frame the button and hint as a drop-zone style panel. For the main upload screen. */
  panel?: boolean;
};

/**
 * Choosing the file is the action: as soon as one is chosen it is sent. The button is a label around
 * the file input, so on a phone or iPad it offers the camera, the photo library or files.
 */
function ChooseFile({
  label,
  variant,
  disabled,
  hint,
  panel,
}: {
  label: string;
  variant: ButtonVariant;
  disabled: boolean;
  hint: string | undefined;
  panel: boolean;
}) {
  const { pending } = useFormStatus();
  const off = disabled || pending;
  return (
    <div
      className={
        panel
          ? "flex flex-col items-start gap-3 rounded-card border-2 border-dashed border-kaki/40 bg-kaki-soft/60 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6"
          : "flex flex-col gap-2"
      }
    >
      {panel ? (
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-kaki-strong shadow-card sm:h-14 sm:w-14">
          <FileUp className="h-6 w-6 sm:h-7 sm:w-7" />
        </span>
      ) : null}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-1">
        <label
          data-variant={variant}
          aria-disabled={off || undefined}
          className={`${buttonClassName(variant, panel ? "lg" : "md")} w-full cursor-pointer has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-kaki sm:w-auto sm:self-start ${off ? "pointer-events-none" : ""}`}
        >
          <input
            type="file"
            name="files"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            className="sr-only"
            disabled={off}
            onChange={(event) => {
              if (event.currentTarget.files && event.currentTarget.files.length > 0) event.currentTarget.form?.requestSubmit();
            }}
          />
          {pending ? "Uploading…" : label}
        </label>
        {hint ? <p className="text-base text-ink-soft">{hint}</p> : null}
        </div>
    </div>
  );
}

export function NoticeUploadForm({ kids = [], selectedChildId = null, childId, label, variant = "primary", hint, panel = false }: Props) {
  const [state, formAction] = useActionState<UploadNoticeState, FormData>(uploadNoticeAction, {});
  const errors = state.errors ?? {};
  const [nickname, setNickname] = useState(state.values?.nickname ?? "");
  const choosing = childId === undefined;
  const hasChildren = kids.length > 0;
  const initialChild = selectedChildId || kids[0]?.id;
  const needsName = choosing && !hasChildren;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {childId ? <input type="hidden" name="childId" value={childId} /> : null}
      {choosing && hasChildren ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="pb-1 text-lg font-semibold text-ink">Who is it for?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {kids.map((child) => (
              <ChoiceCard key={child.id} type="radio" name="childId" value={child.id} label={child.nickname} icon={<UserRound />} defaultChecked={child.id === initialChild} />
            ))}
          </div>
          <p className="text-base text-ink-soft">Someone else? Add them under Account.</p>
        </fieldset>
      ) : null}
      {needsName ? (
        <Field id="nickname" label="Your child's name or nickname" error={errors.nickname}>
          <input
            id="nickname"
            name="nickname"
            type="text"
            autoComplete="off"
            maxLength={40}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            aria-invalid={errors.nickname ? true : undefined}
            aria-describedby={errors.nickname ? "nickname-error" : undefined}
            className={`${inputClassName} sm:max-w-md`}
          />
        </Field>
      ) : null}

      <div className="flex flex-col gap-2">
        <ChooseFile label={label} variant={variant} panel={panel} disabled={needsName && nickname.trim() === ""} hint={needsName && nickname.trim() === "" ? "Enter your child's name first, then choose the notice." : hint} />
        {errors.file ? (
          <p role="alert" className="text-base font-medium text-danger">
            {errors.file}
          </p>
        ) : null}
        {errors.form ? (
          <p role="alert" className="text-base font-medium text-danger">
            {errors.form}
          </p>
        ) : null}
      </div>
    </form>
  );
}
