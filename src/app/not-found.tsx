import Link from "next/link";
import { StatusScreen, primaryActionClassName } from "@/components/ui/status-screen";
import { getRequestId } from "@/lib/request-context";

export default async function NotFound() {
  const requestId = await getRequestId();
  return (
    <StatusScreen
      title="We can't find that page"
      reference={requestId}
      action={
        <Link href="/" className={primaryActionClassName}>
          Go to PaperKaki
        </Link>
      }
    >
      <p>The link may be old, or the page may have moved.</p>
    </StatusScreen>
  );
}
