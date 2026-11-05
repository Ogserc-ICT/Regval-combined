/**
 * Schedule 2 documents per form (SPEC §10).
 */
import type { Settings } from "../settings";
import { activityCategory } from "./pricing";
import { UNLICENSED, type ConditionKey, type FormDoc, type RefData, type SubmissionFacts } from "./types";

export type DocValue = "Y" | "N" | "N/A" | "";

export type DocItem = {
  key: string;
  form: string;
  no: number;
  document: string;
  requiredWhen: string | null;
  /** The value that counts (automatic values override entries). */
  value: DocValue;
  /** What staff entered, if anything. */
  entered: DocValue;
  automatic: boolean;
  /** Why it is automatic, for display. */
  note: string | null;
};

export type DocSummary = {
  form: string | null;
  items: DocItem[];
  listed: number;
  outstanding: number;
  pending: number;
  received: number;
  complete: boolean;
  outstandingText: string[];
};

/** Documents Form: confirmed category's form (accept-and-re-categorise), else the form filed, else the priced category's form. */
export function documentsForm(
  s: Pick<SubmissionFacts, "confirmedCategory" | "formFiled" | "priced">,
  ref: Pick<RefData, "forms">,
  settings: Pick<Settings, "wrongFormHandling">,
): string | null {
  const byCat = (c: string | null | undefined) => (c ? ref.forms.find((f) => f.category === c)?.form ?? null : null);
  if (s.confirmedCategory && settings.wrongFormHandling === "Accept and re-categorise") {
    const f = byCat(s.confirmedCategory);
    if (f) return f;
  }
  if (s.formFiled && ref.forms.some((f) => f.form === s.formFiled)) return s.formFiled;
  return byCat(s.priced?.category);
}

/** Forms whose documents other activities add, when otherActivityDocs = Y (never category I). */
export function otherActivityForms(
  s: Pick<SubmissionFacts, "otherActivities" | "installedCapacityMw">,
  ref: Pick<RefData, "forms" | "activities">,
  settings: Pick<Settings, "otherActivityDocs" | "supplyRetailCategoryAt1MW">,
): string[] {
  if (settings.otherActivityDocs !== "Y") return [];
  const out: string[] = [];
  for (const code of s.otherActivities) {
    const c = activityCategory(code, s.installedCapacityMw, ref.activities, settings);
    if (!c || c === "I") continue;
    const f = `REG-01${c}`;
    if (ref.forms.some((x) => x.form === f) && !out.includes(f)) out.push(f);
  }
  return out;
}

/** The value of a document condition on a submission: "Y", "N" or "" (blank = applies). */
export function conditionValue(s: Pick<SubmissionFacts, "licenceStatus" | "conditions">, key: ConditionKey | string): "Y" | "N" | "" {
  if (key === "holds_any_licence") {
    if (!s.licenceStatus) return "";
    return s.licenceStatus === UNLICENSED ? "N" : "Y";
  }
  const v = s.conditions[key as keyof SubmissionFacts["conditions"]];
  return v === true ? "Y" : v === false ? "N" : "";
}

/**
 * The checklist for a list of forms: the documents form first, payment
 * evidence last, each key once (Register "Document Values" ordering).
 */
export function checklistDocs(primaryForm: string, extraForms: string[], formDocs: FormDoc[]): FormDoc[] {
  const forms = [primaryForm, ...extraForms];
  const candidates = formDocs
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => forms.includes(d.form))
    .sort((a, b) => {
      const pa = a.d.key === "payment_evidence" ? 1 : 0;
      const pb = b.d.key === "payment_evidence" ? 1 : 0;
      if (pa !== pb) return pa - pb;
      const fa = a.d.form === primaryForm ? 0 : 1;
      const fb = b.d.form === primaryForm ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.i - b.i;
    });
  const seen = new Set<string>();
  const out: FormDoc[] = [];
  for (const { d } of candidates) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    out.push(d);
  }
  return out;
}

function norm(v: string | null | undefined): DocValue {
  const u = (v ?? "").trim().toUpperCase();
  return u === "Y" || u === "N" || u === "N/A" ? (u as DocValue) : "";
}

/**
 * Evaluate a checklist. `paymentEvidence` is the automatic value of the
 * payment_evidence document ("N/A" when nothing is payable, "Y" once confirmed
 * payments cover the net fee, else "").
 */
export function summariseDocs(
  form: string | null,
  docs: FormDoc[],
  entries: Record<string, string | null>,
  condition: (key: string) => "Y" | "N" | "",
  paymentEvidence: DocValue,
  conditionQuestion: (key: string) => string,
): DocSummary {
  const items: DocItem[] = docs.map((d) => {
    const entered = norm(entries[d.key]);
    if (d.key === "payment_evidence") {
      return { ...d, value: paymentEvidence, entered, automatic: true, note: "Ticked automatically when Finance confirms the fee" };
    }
    if (d.requiredWhen && condition(d.requiredWhen) === "N") {
      return { ...d, value: "N/A", entered, automatic: true, note: `N/A: “${conditionQuestion(d.requiredWhen)}” is N` };
    }
    return { ...d, value: entered, entered, automatic: false, note: null };
  });
  const outstanding = items.filter((i) => i.value === "N").length;
  const pending = items.filter((i) => i.value === "").length;
  return {
    form,
    items,
    listed: items.length,
    outstanding,
    pending,
    received: items.filter((i) => i.value === "Y").length,
    complete: items.length > 0 && outstanding === 0 && pending === 0,
    outstandingText: items.filter((i) => i.value !== "Y" && i.value !== "N/A").map((i) => i.document),
  };
}
