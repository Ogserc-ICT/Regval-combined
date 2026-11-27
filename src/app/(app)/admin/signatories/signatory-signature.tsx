"use client";

import { useActionState } from "react";
import { Button, Field, FormErrors, Input, Notice } from "@/components/ui";
import { removeSignatorySignatureAction, saveSignatorySignatureAction } from "../actions";

/**
 * A signatory's own e-signature, for people without a staff account (the Chairman / CEO and
 * the Secretary to the Commission). Stamped on CERT-01, and on the payment receipt for the
 * Head of Finance, once the signatory is confirmed.
 */
export function SignatorySignature({ id, name, has, updatedAt, storage }: { id: string; name: string; has: boolean; updatedAt: string | null; storage: boolean }) {
  const [saved, saveAction, saving] = useActionState(saveSignatorySignatureAction, undefined);
  const [removed, removeAction, removing] = useActionState(removeSignatorySignatureAction, undefined);
  const fe = saved && !saved.ok ? saved.fieldErrors : {};

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="mb-1 text-sm font-medium">E-signature</p>
      <p className="mb-3 text-sm text-muted">
        Printed on the certificate (CERT-01) for the Chairman / CEO and the Secretary to the Commission, and on payment receipts for the Head of Finance,
        once this signatory is confirmed. Used instead of the linked staff account&apos;s.
      </p>
      {[saved, removed].map((state, i) =>
        state?.ok ? (
          <Notice key={i} tone="accent" className="mb-3">{state.message}</Notice>
        ) : state && !(i === 0 && Object.keys(fe).length) ? (
          <div key={i} className="mb-3"><FormErrors reasons={state.reasons} /></div>
        ) : null,
      )}
      {!storage ? (
        <Notice tone="warn" className="mb-3">File storage is not set up: connect a private Blob store in Vercel (docs/GO-LIVE.md §2) to upload signatures.</Notice>
      ) : null}
      {has ? (
        <div className="mb-3 flex flex-wrap items-end gap-4">
          <div className="rounded-lg border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, admin-only image */}
            <img src={`/api/signatories/${id}/signature?v=${encodeURIComponent(updatedAt ?? "")}`} alt={`Signature of ${name}`} className="h-16 max-w-64 object-contain" />
          </div>
          <form action={removeAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="secondary" size="sm" disabled={removing}>
              {removing ? "Removing…" : "Remove signature"}
            </Button>
          </form>
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted">No signature yet: the line prints blank for a wet signature.</p>
      )}
      <form action={saveAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <Field label={has ? "Replace with a new PNG" : "Upload a PNG"} htmlFor={`sig-${id}`} errors={fe.signature} hint="A transparent background looks best. Up to 1 MB; crop close to the signature.">
          <Input id={`sig-${id}`} name="signature" type="file" accept="image/png" required disabled={!storage} />
        </Field>
        <Button type="submit" size="sm" disabled={saving || !storage}>
          {saving ? "Saving…" : "Save signature"}
        </Button>
      </form>
    </div>
  );
}
