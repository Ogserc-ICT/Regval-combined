"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A password field with a show/hide button. Shown or hidden, it is marked
 * private, so the idle sign-out never keeps what is typed in it.
 */
export function PasswordInput({ className, id, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} id={id} type={shown ? "text" : "password"} data-private="" spellCheck={false} autoCapitalize="none" autoCorrect="off" className={cn("pr-11", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={id}
        title={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted hover:text-text"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
