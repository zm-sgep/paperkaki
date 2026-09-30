import type { Metadata } from "next";
import { getParentChildren, listChildDevices } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "./actions";
import { ChildrenSection } from "./children-section";

export const metadata: Metadata = { title: "Account · PaperKaki" };

export default async function AccountPage() {
  const parent = await requireParent();
  const [{ children }, devices] = await Promise.all([getParentChildren(parent.parentProfileId), listChildDevices(parent.parentProfileId)]);
  return (
    <>
      <PageHeader title="Account" />
      <Card className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-kaki text-2xl font-bold text-white shadow-button"
          >
            {Array.from(parent.displayName.trim())[0]?.toUpperCase() ?? "?"}
          </span>
          <dl className="flex min-w-0 flex-col gap-3">
            <div>
              <dt className="text-sm font-medium text-ink-soft">Name</dt>
              <dd className="text-lg font-semibold text-ink">{parent.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-ink-soft">Email</dt>
              <dd className="break-all text-lg text-ink">{parent.email}</dd>
            </div>
          </dl>
        </div>
        <form action={signOutAction}>
          <SubmitButton variant="secondary">Sign out</SubmitButton>
        </form>
      </Card>
      <ChildrenSection kids={children} devices={devices} />
    </>
  );
}
