"use server";

import { redirect } from "next/navigation";
import { signInWithEmail } from "@/application/commands/sign-in";

export type SignInState = { error?: string; email?: string };

export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim() : "";
  if (email === "") {
    return { error: "Enter your email address.", email };
  }
  const result = await signInWithEmail(email);
  if (!result.ok) {
    return { error: "That doesn't look like an email address. Check it and try again.", email };
  }
  redirect("/home");
}
