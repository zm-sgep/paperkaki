"use client";

import { useActionState, useEffect, useRef } from "react";
import { REWARD_ICONS, REWARD_ICON_KEYS } from "@/domain/rewards/catalogue";
import { Field, inputClassName } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createRewardAction, giveBonusAction, updateRewardAction, type RewardFormState } from "./actions";

type Child = { id: string; nickname: string };

export type RewardDefaults = {
  title: string;
  description: string | null;
  cost: number;
  icon: string;
  childId: string | null;
  weeklyLimit: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
};

const errorsOf = (state: RewardFormState): Record<string, string> => (state.status === "error" ? state.errors : {});

function describe(id: string, errors: Record<string, string>, field: string) {
  return errors[field] ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

/**
 * Add or edit a reward. Name and points are all that is asked up front; the rest (a picture, a note, a weekly
 * limit, dates, one child only) waits behind "More options" (progressive disclosure).
 */
export function RewardForm({ mode, rewardId, childOptions, defaults, idPrefix }: { mode: "create" | "edit"; rewardId?: string; childOptions: Child[]; defaults?: RewardDefaults; idPrefix: string }) {
  const action = mode === "create" ? createRewardAction : updateRewardAction.bind(null, rewardId as string);
  const [state, formAction] = useActionState<RewardFormState, FormData>(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const errors = errorsOf(state);
  useEffect(() => {
    if (mode === "create" && state.status === "done") formRef.current?.reset();
  }, [mode, state]);
  const id = (name: string) => `${idPrefix}-${name}`;
  const hasOptions = Boolean(defaults && (defaults.description || defaults.icon !== "gift" || defaults.weeklyLimit || defaults.availableFrom || defaults.availableUntil || defaults.childId));

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <Field id={id("title")} label="What is the reward?" error={errors.title}>
        <input id={id("title")} name="title" type="text" required maxLength={60} defaultValue={defaults?.title ?? ""} autoComplete="off" className={inputClassName} {...describe(id("title"), errors, "title")} />
      </Field>
      <Field id={id("cost")} label="How many points?" error={errors.cost}>
        <input id={id("cost")} name="cost" type="text" inputMode="numeric" required defaultValue={defaults?.cost ?? ""} autoComplete="off" className={inputClassName} {...describe(id("cost"), errors, "cost")} />
      </Field>
      <details open={hasOptions || Object.keys(errors).some((key) => !["title", "cost"].includes(key))} className="rounded-lg border-2 border-line px-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold text-kaki">More options</summary>
        <div className="flex flex-col gap-4 pb-4">
          <Field id={id("description")} label="A note for your child (optional)" error={errors.description}>
            <input id={id("description")} name="description" type="text" maxLength={200} defaultValue={defaults?.description ?? ""} autoComplete="off" className={inputClassName} {...describe(id("description"), errors, "description")} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-medium text-ink">Picture</legend>
            <div className="flex flex-wrap gap-2">
              {REWARD_ICON_KEYS.map((key) => (
                <label key={key} className="relative inline-flex min-h-12 min-w-12 cursor-pointer items-center gap-2 rounded-lg border-2 border-line px-3 text-base has-[:checked]:border-kaki has-[:checked]:bg-kaki-soft has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-kaki">
                  <input type="radio" name="icon" value={key} defaultChecked={(defaults?.icon ?? "gift") === key} className="sr-only" />
                  <span aria-hidden="true" className="text-2xl">
                    {REWARD_ICONS[key].symbol}
                  </span>
                  <span>{REWARD_ICONS[key].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {childOptions.length > 1 ? (
            <Field id={id("childId")} label="Who is it for?">
              <select id={id("childId")} name="childId" defaultValue={defaults?.childId ?? ""} className={inputClassName}>
                <option value="">All my children</option>
                {childOptions.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.nickname}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field id={id("weeklyLimit")} label="Most times a week (optional)" error={errors.weeklyLimit}>
            <input id={id("weeklyLimit")} name="weeklyLimit" type="text" inputMode="numeric" defaultValue={defaults?.weeklyLimit ?? ""} autoComplete="off" className={inputClassName} {...describe(id("weeklyLimit"), errors, "weeklyLimit")} />
          </Field>
          <Field id={id("availableFrom")} label="First day (optional)" error={errors.availableFrom}>
            <input id={id("availableFrom")} name="availableFrom" type="date" defaultValue={defaults?.availableFrom ?? ""} className={inputClassName} {...describe(id("availableFrom"), errors, "availableFrom")} />
          </Field>
          <Field id={id("availableUntil")} label="Last day (optional)" error={errors.availableUntil}>
            <input id={id("availableUntil")} name="availableUntil" type="date" defaultValue={defaults?.availableUntil ?? ""} className={inputClassName} {...describe(id("availableUntil"), errors, "availableUntil")} />
          </Field>
        </div>
      </details>
      {state.status === "done" ? (
        <p role="status" className="text-lg font-medium text-kaki-strong">
          {state.message}
        </p>
      ) : null}
      <SubmitButton variant="primary" className="w-full sm:w-auto sm:self-start">
        {mode === "create" ? "Add reward" : "Save changes"}
      </SubmitButton>
    </form>
  );
}

/** "Give bonus points": points and a reason that is required. `submissionId` makes a double tap give once. */
export function BonusForm({ childId, childNickname, submissionId }: { childId: string; childNickname: string; submissionId: string }) {
  const [state, formAction] = useActionState<RewardFormState, FormData>(giveBonusAction.bind(null, childId), { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const errors = errorsOf(state);
  useEffect(() => {
    if (state.status === "done") formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="submissionId" value={submissionId} />
      <Field id="bonus-points" label={`How many points for ${childNickname}?`} error={errors.points}>
        <input id="bonus-points" name="points" type="text" inputMode="numeric" required autoComplete="off" className={inputClassName} {...describe("bonus-points", errors, "points")} />
      </Field>
      <Field id="bonus-reason" label="What is it for?" hint="Your child will see this." error={errors.reason}>
        <input id="bonus-reason" name="reason" type="text" required maxLength={120} autoComplete="off" className={inputClassName} {...describe("bonus-reason", errors, "reason")} />
      </Field>
      {state.status === "done" ? (
        <p role="status" className="text-lg font-medium text-kaki-strong">
          {state.message}
        </p>
      ) : null}
      <SubmitButton variant="secondary" className="w-full sm:w-auto sm:self-start">
        Give the points
      </SubmitButton>
    </form>
  );
}
