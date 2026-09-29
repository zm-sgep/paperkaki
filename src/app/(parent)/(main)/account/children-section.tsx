"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Field, inputClassName } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  addChildAction,
  archiveChildAction,
  renameChildAction,
  type ChildFormState,
} from "./children-actions";

type Child = { id: string; nickname: string };

function RenameForm({ child }: { child: Child }) {
  const [state, formAction] = useActionState<ChildFormState, FormData>(renameChildAction.bind(null, child.id), {});
  const id = `rename-${child.id}`;
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-12 cursor-pointer items-center px-2 text-base font-semibold text-kaki">Rename</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-3">
        <Field id={id} label={`New name for ${child.nickname}`} error={state.error}>
          <input id={id} name="nickname" type="text" defaultValue={child.nickname} maxLength={40} autoComplete="off" aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? `${id}-error` : undefined} className={inputClassName} />
        </Field>
        <SubmitButton variant="secondary" className="w-full sm:w-auto sm:self-start">
          Save name
        </SubmitButton>
      </form>
    </details>
  );
}

function ArchiveForm({ child }: { child: Child }) {
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-12 cursor-pointer items-center px-2 text-base font-semibold text-danger">Archive</summary>
      <form action={archiveChildAction.bind(null, child.id)} className="mt-2 flex flex-col gap-3 rounded-lg border-2 border-danger p-4">
        <p className="text-lg text-ink">
          Archive {child.nickname}? Their assessments will be hidden from your screens.
        </p>
        <SubmitButton variant="danger" className="w-full sm:w-auto sm:self-start">
          Yes, archive {child.nickname}
        </SubmitButton>
      </form>
    </details>
  );
}

export function ChildrenSection({ kids }: { kids: Child[] }) {
  const [state, formAction] = useActionState<ChildFormState, FormData>(addChildAction, {});
  return (
    <Card className="flex flex-col gap-5" >
      <h2 className="text-xl font-semibold text-ink">Children</h2>
      {kids.length === 0 ? (
        <p className="text-lg text-ink-soft">No children yet. Add one below, or when you add an assessment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {kids.map((child) => (
            <li key={child.id} className="flex flex-col gap-1 py-3 first:pt-0">
              <p className="text-lg font-medium text-ink">{child.nickname}</p>
              <p className="text-base text-ink-soft">Primary 3</p>
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                <RenameForm child={child} />
                <ArchiveForm child={child} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <form key={kids.length} action={formAction} className="flex flex-col gap-3">
        <Field id="new-child" label="Add a child" error={state.error}>
          <input id="new-child" name="nickname" type="text" maxLength={40} autoComplete="off" placeholder="Name or nickname" aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "new-child-error" : undefined} className={inputClassName} />
        </Field>
        <SubmitButton variant="secondary" className="w-full sm:w-auto sm:self-start">
          Add child
        </SubmitButton>
      </form>
    </Card>
  );
}
