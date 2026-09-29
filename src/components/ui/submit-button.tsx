"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** A submit Button that shows its loading state while the surrounding form's action runs. */
export function SubmitButton(props: Omit<ButtonProps, "type" | "loading">) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" loading={pending} />;
}
