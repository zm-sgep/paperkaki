import type { Metadata } from "next";
import { getParentChildren } from "@/application/queries/children";
import { requireParent } from "@/application/queries/current-parent";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "./actions";
import { ChildrenSection } from "./children-section";

export const metadata: Metadata = { title: "Account · PaperKaki" };

export default async function AccountPage() {
  const parent = await requireParent();
  const { children } = await getParentChildren(parent.parentProfileId);
  return (
    <>
      <PageHeader title="Account" />
      <Card className="flex flex-col gap-4">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm text-ink-soft">Name</dt>
            <dd className="text-lg text-ink">{parent.displayName}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-soft">Email</dt>
            <dd className="break-all text-lg text-ink">{parent.email}</dd>
          </div>
        </dl>
        <form action={signOutAction}>
          <SubmitButton variant="secondary">Sign out</SubmitButton>
        </form>
      </Card>
      <ChildrenSection kids={children} />
    </>
  );
}
