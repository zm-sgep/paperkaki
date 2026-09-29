"use client";

import { useActionState, useState } from "react";
import { ChoiceCard } from "@/components/ui/choice-card";
import { SubmitButton } from "@/components/ui/submit-button";
import { confirmTopicsAction, type ScopeState } from "./actions";

type Topic = { id: string; label: string; selected: boolean; hasQuestions: boolean };

export function ScopeForm({ assessmentId, topics }: { assessmentId: string; topics: Topic[] }) {
  const [state, formAction] = useActionState<ScopeState, FormData>(confirmTopicsAction.bind(null, assessmentId), {});
  const [selected, setSelected] = useState<Set<string>>(() => new Set(topics.filter((t) => t.selected).map((t) => t.id)));
  const none = selected.size === 0;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Topics</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {topics.map((topic) => (
            <ChoiceCard
              key={topic.id}
              type="checkbox"
              name="topic"
              value={topic.id}
              label={topic.label}
              hint={topic.hasQuestions ? undefined : "Not in our question bank yet"}
              defaultChecked={topic.selected}
              onChange={(on) => toggle(topic.id, on)}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <SubmitButton variant="primary" disabled={none} className="w-full sm:w-auto sm:self-start">
          Confirm topics
        </SubmitButton>
        {none ? (
          <p id="scope-reason" className="text-base text-ink-soft">
            Tick at least one topic to continue.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-base font-medium text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
