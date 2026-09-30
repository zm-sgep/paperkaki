"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Field, inputClassName } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createPairingCodeAction, handDeviceAction, removeDeviceAction, type PairingState } from "./device-actions";
import {
  addChildAction,
  archiveChildAction,
  renameChildAction,
  type ChildFormState,
} from "./children-actions";

type Child = { id: string; nickname: string };
type Device = { id: string; childId: string; label: string };

function RenameForm({ child }: { child: Child }) {
  const [state, formAction] = useActionState<ChildFormState, FormData>(renameChildAction.bind(null, child.id), {});
  const id = `rename-${child.id}`;
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-12 cursor-pointer items-center px-2 text-base font-semibold text-kaki-strong">Rename</summary>
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
      <form action={archiveChildAction.bind(null, child.id)} className="mt-2 flex flex-col gap-3 rounded-control border border-coral/40 bg-coral-soft p-4">
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

function SetUpDevice({ child }: { child: Child }) {
  const [state, formAction] = useActionState<PairingState, FormData>(createPairingCodeAction.bind(null, child.id), {});
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-12 cursor-pointer items-center px-2 text-base font-semibold text-kaki-strong">Set up {child.nickname}&apos;s iPad</summary>
      <div className="mt-2 flex flex-col gap-3 rounded-control border border-line bg-paper p-4">
        <p className="text-lg text-ink">
          On {child.nickname}&apos;s device, open the link below and type the code. The code works once, for 10 minutes.
        </p>
        {state.code ? (
          <div data-pairing-code className="flex flex-col gap-2">
            <p aria-label={`Code ${state.code}`} data-numeric className="w-fit rounded-control bg-kaki-soft px-5 py-3 text-4xl font-bold tracking-widest text-kaki-strong">
              {state.code}
            </p>
            <p className="break-all text-lg text-ink">
              Open <span className="font-semibold">{state.link}</span>
            </p>
          </div>
        ) : null}
        <form action={formAction}>
          <SubmitButton variant={state.code ? "secondary" : "primary"} className="w-full sm:w-auto">
            {state.code ? "Show a new code" : "Show a code"}
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}

function RemoveDevice({ device }: { device: Device }) {
  return (
    <details className="w-full">
      <summary className="inline-flex min-h-12 cursor-pointer items-center px-2 text-base font-semibold text-danger">Remove</summary>
      <form action={removeDeviceAction.bind(null, device.id)} className="mt-2 flex flex-col gap-3 rounded-control border border-coral/40 bg-coral-soft p-4">
        <p className="text-lg text-ink">Remove {device.label}? It will need a new code to open PaperKaki again.</p>
        <SubmitButton variant="danger" className="w-full sm:w-auto sm:self-start">
          Yes, remove it
        </SubmitButton>
      </form>
    </details>
  );
}

export function ChildrenSection({ kids, devices = [] }: { kids: Child[]; devices?: Device[] }) {
  const [state, formAction] = useActionState<ChildFormState, FormData>(addChildAction, {});
  return (
    <Card className="flex flex-col gap-5" >
      <h2 className="text-xl font-bold tracking-tight text-ink">Children</h2>
      {kids.length === 0 ? (
        <p className="text-lg text-ink-soft">No children yet. Add one below, or when you add an assessment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {kids.map((child) => (
            <li key={child.id} className="flex flex-col gap-1 py-4 first:pt-0">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kaki-soft text-lg font-bold text-kaki-strong">
                  {Array.from(child.nickname.trim())[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-lg font-semibold text-ink">{child.nickname}</p>
                  <p className="text-base text-ink-soft">Primary 3</p>
                </div>
              </div>
              <div data-child-devices={child.id} className="flex flex-col gap-1">
                {devices
                  .filter((device) => device.childId === child.id)
                  .map((device) => (
                    <div key={device.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <p className="text-lg text-ink">{device.label}</p>
                      <RemoveDevice device={device} />
                    </div>
                  ))}
                <SetUpDevice child={child} />
                <form action={handDeviceAction.bind(null, child.id)} className="py-1">
                  <SubmitButton variant="secondary" className="w-full sm:w-auto">
                    Hand this device to {child.nickname}
                  </SubmitButton>
                </form>
              </div>
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
