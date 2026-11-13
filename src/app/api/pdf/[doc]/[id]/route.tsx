/**
 * The four registration documents as PDFs, generated on request from the current records
 * (Phase 10; SPEC §24.1). /api/pdf/{acknowledgement|deficiency|eval-01|certificate}/{submission id}
 * ?download=1 saves instead of opening; ?notice={id} picks an earlier deficiency notice.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { ReactElement } from "react";
import { writeAudit } from "@/server/audit";
import { auditActor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { ServiceError } from "@/server/errors";
import { AcknowledgementLetter } from "@/server/pdf/acknowledgement-letter";
import { Certificate } from "@/server/pdf/certificate";
import { registerFonts } from "@/server/pdf/common";
import { DeficiencyNotice } from "@/server/pdf/deficiency-notice";
import { Eval01 } from "@/server/pdf/eval-01";
import { pdfActor, pdfResponse } from "@/server/pdf/respond";
import { acknowledgementData, certificateData, deficiencyData, evaluationData } from "@/server/services/letters";

export const runtime = "nodejs";

const DOCS = ["acknowledgement", "deficiency", "eval-01", "certificate"] as const;
type Doc = (typeof DOCS)[number];
const LABEL: Record<Doc, string> = {
  acknowledgement: "Acknowledgement letter",
  deficiency: "Deficiency notice",
  "eval-01": "EVAL-01",
  certificate: "CERT-01 certificate",
};

const fileSafe = (v: string) => v.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "");

export async function GET(req: Request, { params }: { params: Promise<{ doc: string; id: string }> }) {
  const { doc, id } = await params;
  if (!(DOCS as readonly string[]).includes(doc) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found.", { status: 404 });
  const actor = await pdfActor("reports:print");
  if (actor instanceof Response) return actor;
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  registerFonts();
  try {
    let element: ReactElement;
    let ref: string;
    let filename: string;
    let detail: string;
    switch (doc as Doc) {
      case "acknowledgement": {
        const x = await acknowledgementData(db, id, actor.name);
        element = <AcknowledgementLetter x={x} />;
        ref = x.ackNo;
        filename = `Acknowledgement-${fileSafe(x.ackNo)}.pdf`;
        detail = `Acknowledgement letter ${x.ackNo} printed`;
        break;
      }
      case "deficiency": {
        const notice = url.searchParams.get("notice");
        const x = await deficiencyData(db, id, notice && /^[0-9a-f-]{36}$/i.test(notice) ? notice : null);
        element = <DeficiencyNotice x={x} />;
        ref = x.ackNo;
        filename = `${x.draft ? "DRAFT-" : ""}Deficiency-${fileSafe(x.defNo)}.pdf`;
        detail = `Deficiency notice ${x.defNo} printed${x.draft ? " as a draft (not yet sent)" : ""}`;
        break;
      }
      case "eval-01": {
        const x = await evaluationData(db, id);
        element = <Eval01 x={x} />;
        ref = x.ackNo;
        filename = `EVAL-01-${fileSafe(x.ackNo)}.pdf`;
        detail = `EVAL-01 printed`;
        break;
      }
      case "certificate": {
        const x = await certificateData(db, id);
        const qr = await QRCode.toBuffer(`${url.origin}/register/${x.submissionId}`, { margin: 0, width: 240, errorCorrectionLevel: "M" });
        element = <Certificate x={x} qr={qr} />;
        ref = x.registrationNo;
        const mark = x.voidReason ? `${fileSafe(x.voidReason)}-` : x.draftReason ? "DRAFT-" : "";
        filename = `${mark}CERT-01-${fileSafe(x.registrationNo)}.pdf`;
        detail = `Certificate ${x.registrationNo} (serial ${x.serial}) printed${x.voidReason ? ` marked ${x.voidReason}` : x.draftReason ? " as a draft: signatories not confirmed" : ""}`;
        break;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- renderToBuffer wants a <Document> element
    const buffer = await renderToBuffer(element as any);
    await db.transaction((tx) =>
      writeAudit(tx, { actor: auditActor(actor), action: `${LABEL[doc as Doc]} printed`, module: "registration", entityType: "submission", entityId: id, reference: ref, detail }),
    );
    return pdfResponse(buffer, filename, download);
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.reasons.join(" "), { status: e.status });
    throw e;
  }
}
