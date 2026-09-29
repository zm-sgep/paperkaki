import { redirect } from "next/navigation";
import { getCurrentParent } from "@/application/queries/current-parent";

/** No page of its own: signed-in parents go to Home, everyone else to sign-in. */
export default async function RootPage() {
  redirect((await getCurrentParent()) ? "/home" : "/sign-in");
}
