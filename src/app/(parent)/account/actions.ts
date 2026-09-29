"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/application/commands/sign-out";

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}
