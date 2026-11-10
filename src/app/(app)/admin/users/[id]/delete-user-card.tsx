"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, FormErrors } from "@/components/ui";
import { removeUserAction } from "../../actions";

/** Delete a staff account, with a confirm step (docs/PLAN.md §6). */
export function DeleteUserCard({ id, name, isSelf }: { id: string; name: string; isSelf: boolean }) {
  const [state, action, pending] = useActionState(removeUserAction, undefined);
  const [asking, setAsking] = useState(false);

  return (
    <Card className="border-danger/30">
      <CardHeader
        title="Delete staff"
        description="Removes the person from the staff list and every officer list, signs them out everywhere and stops them signing in. Their email can be used for a new account. Records they worked on keep their name, as the register requires."
      />
      <CardBody>
        {state && !state.ok ? (
          <div className="mb-4">
            <FormErrors reasons={state.reasons} />
          </div>
        ) : null}
        {isSelf ? (
          <p className="text-sm text-muted">You cannot delete your own account. Ask another admin.</p>
        ) : !asking ? (
          <Button type="button" variant="danger" onClick={() => setAsking(true)}>
            <Trash2 className="h-4 w-4" /> Delete {name}…
          </Button>
        ) : (
          <form action={action} className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-text">
              Delete <span className="font-semibold">{name}</span>? This cannot be undone. To have them back, create a new account.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)} disabled={pending}>
                Keep the account
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
