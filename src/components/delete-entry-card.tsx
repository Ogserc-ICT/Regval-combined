"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, Field, FormErrors, Input } from "@/components/ui";
import type { ActionResult } from "@/server/errors";

type DeleteAction = (prev: ActionResult<string> | undefined, form: FormData) => Promise<ActionResult<string>>;

/** Admin only: delete one entry for good, confirmed by typing its ACK number. */
export function DeleteEntryCard({ action, id, ack, what, withIt }: { action: DeleteAction; id: string; ack: string; what: string; withIt: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [asking, setAsking] = useState(false);
  const fe = state && !state.ok ? state.fieldErrors : {};
  return (
    <Card className="mt-6 border-danger/30">
      <CardHeader title={`Delete this ${what}`} description={`Admin only. Deletes ${ack} with ${withIt}. It cannot be undone; its numbers are never given out again. Recorded in the audit log.`} />
      <CardBody>
        {state && !state.ok && !fe.confirmAck ? (
          <div className="mb-4">
            <FormErrors reasons={state.reasons} />
          </div>
        ) : null}
        {!asking ? (
          <Button type="button" variant="danger" onClick={() => setAsking(true)}>
            <Trash2 className="h-4 w-4" /> Delete {ack}…
          </Button>
        ) : (
          <form action={run} className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4">
            <input type="hidden" name="id" value={id} />
            <Field label={`Type ${ack} to confirm`} htmlFor="confirmAck" errors={fe.confirmAck} className="max-w-sm">
              <Input id="confirmAck" name="confirmAck" autoComplete="off" spellCheck={false} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Deleting…" : "Delete for good"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAsking(false)} disabled={pending}>
                Keep it
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
