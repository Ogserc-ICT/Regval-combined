/**
 * Reference data from the workbook (seed/data/reference.json, extracted from
 * the Lists and Registry Lists sheets). Inserted only where missing, so admin
 * edits are never overwritten.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../src/server/db/connect";
import {
  activities,
  documentConditions,
  evalChecks,
  feeSchedule,
  formDocuments,
  forms,
  listItems,
  signatories,
} from "../src/server/db/schema";
import { writeAudit, type AuditActor } from "../src/server/audit";

type Ref = {
  fees: { category: string; registrationFee: number; lateInitial: number; lateDaily: number; lateCap: number; lateTier: number | null; description: string }[];
  activities: { name: string; code: string; cat10MwPlus: string; cat1To10Mw: string; catBelow1Mw: string; capacityBased: boolean; sort: number }[];
  forms: { form: string; category: string; title: string; orderPara: string }[];
  formDocuments: { form: string; no: number; key: string; document: string; requiredWhen: string | null }[];
  conditions: { key: string; question: string; sort: number }[];
  checks: { id: string; stage: string; text: string; ruleText: string; sort: number }[];
  lists: { listKey: string; value: string; sort: number }[];
  signatories: { name: string; designation: string }[];
};

export function readReference(): Ref {
  return JSON.parse(readFileSync(path.join(process.cwd(), "seed", "data", "reference.json"), "utf8")) as Ref;
}

export async function seedReference(db: Db, actor: AuditActor): Promise<Record<string, number>> {
  const r = readReference();
  const added: Record<string, number> = {};
  await db.transaction(async (tx) => {
    const count = async (name: string, rows: unknown[]) => {
      added[name] = rows.length;
    };
    await count("fees", await tx.insert(feeSchedule).values(r.fees).onConflictDoNothing().returning({ k: feeSchedule.category }));
    await count("activities", await tx.insert(activities).values(r.activities).onConflictDoNothing().returning({ k: activities.code }));
    await count("forms", await tx.insert(forms).values(r.forms).onConflictDoNothing().returning({ k: forms.form }));
    await count("formDocuments", await tx.insert(formDocuments).values(r.formDocuments).onConflictDoNothing().returning({ k: formDocuments.key }));
    await count("conditions", await tx.insert(documentConditions).values(r.conditions).onConflictDoNothing().returning({ k: documentConditions.key }));
    await count("checks", await tx.insert(evalChecks).values(r.checks).onConflictDoNothing().returning({ k: evalChecks.id }));
    await count(
      "lists",
      await tx
        .insert(listItems)
        .values(r.lists.map((l) => ({ listKey: l.listKey, value: l.value, sort: l.sort })))
        .onConflictDoNothing()
        .returning({ k: listItems.value }),
    );
    // [G3] One signatory list. Seed the workbook's names unconfirmed; never invent the Commissioner.
    let sig = 0;
    for (const s of r.signatories) {
      const [exists] = await tx.select({ id: signatories.id }).from(signatories).where(eq(signatories.name, s.name));
      if (exists) continue;
      const role = /chairman/i.test(s.designation) ? "chairman_ceo" : /secretary/i.test(s.designation) ? "secretary" : "other";
      await tx.insert(signatories).values({
        name: s.name,
        designation: role === "chairman_ceo" ? "Chairman / Chief Executive Officer" : s.designation,
        role,
        confirmed: false,
        note: `From the workbook (designation “${s.designation}”). Confirm before use (Q12).`,
      });
      sig += 1;
    }
    added.signatories = sig;
    const total = Object.values(added).reduce((a, b) => a + b, 0);
    if (total) {
      await writeAudit(tx, {
        actor,
        action: "Reference data seeded",
        module: "system",
        detail: Object.entries(added)
          .filter(([, n]) => n)
          .map(([k, n]) => `${k}: ${n}`)
          .join("; "),
      });
    }
  });
  return added;
}
