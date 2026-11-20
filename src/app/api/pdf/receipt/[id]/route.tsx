/**
 * Official receipt of a Finance-confirmed payment, generated on request:
 * /api/pdf/receipt/{payment id}; ?download=1 saves instead of opening.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { writeAudit } from "@/server/audit";
import { auditActor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { registerFonts } from "@/server/pdf/common";
import { PaymentReceipt } from "@/server/pdf/payment-receipt";
import { pdfActor, pdfResponse } from "@/server/pdf/respond";
import { receiptData } from "@/server/services/letters";

export const runtime = "nodejs";

const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "");

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const actor = await pdfActor("payment:receipt");
  if (actor instanceof Response) return actor;
  const url = new URL(req.url);
  registerFonts();
  try {
    const x = await receiptData(db, id);
    const qr = await QRCode.toBuffer(`${url.origin}${x.ownerPath}`, { margin: 0, width: 240, errorCorrectionLevel: "M" });
    const buffer = await renderToBuffer(<PaymentReceipt x={x} qr={qr} />);
    const mark = x.reversedReason ? "REVERSED-" : x.draftReason ? "DRAFT-" : "";
    const note = x.reversedReason ? " marked REVERSED" : x.draftReason ? " as a draft: no confirmed Head of Finance" : "";
    await db.transaction((tx) =>
      writeAudit(tx, {
        actor: auditActor(actor),
        action: "Payment receipt printed",
        module: "registration",
        entityType: x.ownerType,
        entityId: x.ownerId,
        reference: x.reference,
        detail: `Receipt ${x.payNo} printed${note}`,
        data: { payment: x.payNo },
      }),
    );
    return pdfResponse(buffer, `${mark}Receipt-${fileSafe(x.payNo)}.pdf`, url.searchParams.get("download") === "1");
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.reasons.join(" "), { status: e.status });
    throw e;
  }
}
