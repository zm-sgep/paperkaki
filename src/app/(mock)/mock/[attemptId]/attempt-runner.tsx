"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { MockAttempt } from "@/components/mock/MockAttempt";
import { ATTEMPT_SNAPSHOT_VERSION, type MockAttemptSnapshot, type QuestionResponse } from "@/components/mock/attempt-state";
import type { MockPaper } from "@/components/mock/types";
import { ButtonLink } from "@/components/ui/button";
import { saveProgressAction, submitAttemptAction } from "./actions";

/**
 * Connects Mock Mode to the server: answers are sent as the child works (only the questions that
 * changed), the paper is handed in through a server action, and the clock is anchored on the
 * server's count. If saving fails, the paper carries on from this device's own copy, a calm line
 * says so, and the sending is retried.
 */

export type SavedAttemptData = {
  currentIndex: number;
  responses: Record<string, QuestionResponse>;
  flagged: string[];
  savedAt: string;
};

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000];
const NOTICE_AFTER_FAILURES = 2;

type Sent = { key: string };

function questionKey(snapshot: MockAttemptSnapshot, id: string): string {
  const response = snapshot.responses[id];
  return JSON.stringify({
    selected: response?.selected ?? null,
    typed: response?.typed ?? null,
    strokes: response?.strokes ?? null,
    flagged: snapshot.flagged.includes(id),
  });
}

export function AttemptRunner({
  paper,
  saved,
  serverElapsedSeconds,
  imageUrls,
}: {
  paper: MockPaper;
  saved: SavedAttemptData;
  serverElapsedSeconds: number;
  imageUrls: Record<string, string>;
}): ReactElement {
  const router = useRouter();
  const attemptId = paper.attemptId;
  const questionIds = useMemo(() => paper.questions.map((q) => q.id), [paper.questions]);
  const [notice, setNotice] = useState<string | undefined>();

  const initialSnapshot = useMemo<MockAttemptSnapshot>(
    () => ({
      version: ATTEMPT_SNAPSHOT_VERSION,
      attemptId,
      current: saved.currentIndex,
      responses: saved.responses,
      flagged: saved.flagged,
      elapsedSeconds: serverElapsedSeconds,
      savedAt: saved.savedAt,
    }),
    [attemptId, saved, serverElapsedSeconds],
  );

  // What the server is known to hold, per question, and the last position it was told.
  const sent = useRef<Map<string, Sent> | null>(null);
  if (sent.current === null) {
    sent.current = new Map(questionIds.map((id) => [id, { key: questionKey(initialSnapshot, id) }]));
  }
  const sentPosition = useRef(saved.currentIndex + 1);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const latest = useRef<MockAttemptSnapshot>(initialSnapshot);
  const failures = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const syncRef = useRef<(snapshot: MockAttemptSnapshot) => Promise<boolean>>(() => Promise.resolve(true));

  /** Sends what differs from the server. Resolves true when the server holds everything. */
  const send = useCallback(
    async (snapshot: MockAttemptSnapshot): Promise<boolean> => {
      const table = sent.current as Map<string, Sent>;
      const changed = questionIds.filter((id) => table.get(id)?.key !== questionKey(snapshot, id));
      const position = snapshot.current + 1;
      if (changed.length === 0 && position === sentPosition.current) return true;
      const keys = new Map(changed.map((id) => [id, questionKey(snapshot, id)]));
      try {
        const result = await saveProgressAction(attemptId, {
          position,
          savedAt: snapshot.savedAt,
          responses: changed.map((id) => {
            const response = snapshot.responses[id];
            return {
              paperQuestionId: id,
              selected: response?.selected ?? null,
              typed: response?.typed ?? null,
              strokes: response?.strokes ?? null,
              flagged: snapshot.flagged.includes(id),
            };
          }),
        });
        if (!result.ok) {
          if (result.reason === "not_open") {
            // Handed in on another device: show where things stand.
            setNotice("This paper has already been handed in.");
            router.refresh();
            return true;
          }
          return false;
        }
        for (const [id, key] of keys) table.set(id, { key });
        sentPosition.current = position;
        failures.current = 0;
        setNotice(undefined);
        return true;
      } catch {
        return false;
      }
    },
    [attemptId, questionIds, router],
  );

  /** One send at a time, in order; retried on a gentle back-off when it fails. */
  const sync = useCallback(
    (snapshot: MockAttemptSnapshot): Promise<boolean> => {
      latest.current = snapshot;
      const run = chain.current.then(() => send(latest.current));
      chain.current = run.then((ok) => {
        if (ok) return true;
        failures.current += 1;
        if (failures.current >= NOTICE_AFTER_FAILURES) {
          setNotice("We couldn't save just now. Your work is safe on this iPad, and we'll keep trying.");
        }
        if (retryTimer.current === null) {
          const delay = RETRY_DELAYS_MS[Math.min(failures.current - 1, RETRY_DELAYS_MS.length - 1)] ?? 20_000;
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = null;
            void syncRef.current(latest.current);
          }, delay);
        }
        return false;
      });
      return chain.current;
    },
    [send],
  );

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    const onOnline = () => void sync(latest.current);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    };
  }, [sync]);

  return (
    <MockAttempt
      paper={paper}
      imageUrls={imageUrls}
      initialSnapshot={initialSnapshot}
      serverElapsedSeconds={serverElapsedSeconds}
      notice={notice}
      onSave={(snapshot) => void sync(snapshot)}
      onSubmit={async (snapshot) => {
        // Everything reaches the server first; only then is the paper handed in.
        if (!(await sync(snapshot))) throw new Error("not saved");
        const result = await submitAttemptAction(attemptId);
        if (!result.ok) throw new Error("not submitted");
      }}
      onLeave={() => router.push("/today")}
      submittedAction={
        <ButtonLink href="/today" className="min-h-14 rounded-2xl px-8 text-xl">
          Back to Today
        </ButtonLink>
      }
    />
  );
}
