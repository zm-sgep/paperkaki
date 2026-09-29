import type { Metadata } from "next";
import { requireAdmin } from "@/application/queries/current-parent";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Admin · PaperKaki" };

export default async function AdminPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Admin" />
      <section>
        <h2 className="text-xl font-semibold text-ink">Curriculum</h2>
        <p className="text-lg text-ink-soft">Not built yet</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold text-ink">Question bank</h2>
        <p className="text-lg text-ink-soft">Not built yet</p>
      </section>
    </>
  );
}
