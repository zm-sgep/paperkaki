import type { NoticeFailureCode } from "@/application/notice-processing";
import { NoticeUploadForm } from "@/app/(parent)/(main)/prepare/new/notice-upload-form";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteNoticeAction, retryNoticeAction } from "./actions";

const COPY: Record<"unreadable" | "no_maths" | "later", { title: string; body: string }> = {
  unreadable: {
    title: "We couldn't read this file clearly.",
    body: "Your child's details are saved. A sharper photo or the original PDF usually helps.",
  },
  no_maths: {
    title: "We couldn't find the Mathematics part of this notice.",
    body: "Your child's details are saved. Choose the page with the Mathematics topics, or enter the details yourself.",
  },
  later: {
    title: "We couldn't read this file right now.",
    body: "Your file and your child's details are saved. Please try again in a moment.",
  },
};

/** What happened, what is safe, and what to do next (UX_SPEC 16). One clear action first. */
export function NoticeFailed({ sourceId, code, retry, childId }: { sourceId: string; code: NoticeFailureCode; retry: boolean; childId: string }) {
  const copy = retry ? COPY.later : code === "no_maths" ? COPY.no_maths : COPY.unreadable;
  return (
    <>
      <PageHeader title={copy.title} description={copy.body} />
      <div className="flex flex-col gap-4">
        {retry ? (
          <form action={retryNoticeAction.bind(null, sourceId)}>
            <SubmitButton variant="primary" size="lg" className="w-full sm:w-auto">
              Try again
            </SubmitButton>
          </form>
        ) : null}
        <NoticeUploadForm childId={childId} label="Try another file" variant={retry ? "secondary" : "primary"} />
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <ButtonLink href="/prepare/new?manual=1" variant="quiet" className="self-start">
            Enter details myself
          </ButtonLink>
          <form action={deleteNoticeAction.bind(null, sourceId)}>
            <SubmitButton variant="quiet">Delete this file</SubmitButton>
          </form>
        </div>
      </div>
    </>
  );
}
