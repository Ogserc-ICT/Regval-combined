"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, Field, FormErrors, Input, Notice } from "@/components/ui";
import { removeSignatureAction, saveSignatureAction } from "../../actions";

/**
 * The person's e-signature: stamped on the acknowledgement letter, deficiency notice and
 * EVAL-01 where they sign. CERT-01 is always signed by hand.
 */
export function SignatureCard({ id, name, has, updatedAt, storage }: { id: string; name: string; has: boolean; updatedAt: string | null; storage: boolean }) {
  const [saved, saveAction, saving] = useActionState(saveSignatureAction, undefined);
  const [removed, removeAction, removing] = useActionState(removeSignatureAction, undefined);
  const fe = saved && !saved.ok ? saved.fieldErrors : {};
  // A new URL after each change so the preview never shows the old image.
  const bust = `${updatedAt ?? ""}`;

  return (
    <Card>
      <CardHeader
        title="E-signature"
        description="Printed on this person's acknowledgement letters, sent deficiency notices, and EVAL-01 forms once the decision is recorded. Never on the certificate, which is signed by hand."
      />
      <CardBody>
        {[saved, removed].map((state, i) =>
          state?.ok ? (
            <Notice key={i} tone="accent" className="mb-4">{state.message}</Notice>
          ) : state && !(i === 0 && Object.keys(fe).length) ? (
            <div key={i} className="mb-4"><FormErrors reasons={state.reasons} /></div>
          ) : null,
        )}
        {!storage ? (
          <Notice tone="warn" className="mb-4">File storage is not set up: connect a private Blob store in Vercel (docs/GO-LIVE.md §2) to upload signatures.</Notice>
        ) : null}
        {has ? (
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="rounded-lg border border-border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, admin-only image */}
              <img src={`/api/signatures/${id}?v=${encodeURIComponent(bust)}`} alt={`Signature of ${name}`} className="h-16 max-w-64 object-contain" />
            </div>
            <form action={removeAction}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="secondary" disabled={removing}>
                {removing ? "Removing…" : "Remove signature"}
              </Button>
            </form>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">No signature yet: their lines print blank for a wet signature.</p>
        )}
        <form action={saveAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <Field label={has ? "Replace with a new PNG" : "Upload a PNG"} htmlFor="signature" errors={fe.signature} hint="A transparent background looks best. Up to 1 MB; crop close to the signature.">
            <Input id="signature" name="signature" type="file" accept="image/png" required disabled={!storage} />
          </Field>
          <div>
            <Button type="submit" disabled={saving || !storage}>
              {saving ? "Saving…" : "Save signature"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
