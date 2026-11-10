/**
 * Capture and refill form fields in the browser (docs/PLAN.md §11f, 8c).
 * Works on plain and React-controlled fields alike: values are set through the
 * element's native setter and announced with the event React listens for.
 * Password, file and hidden fields are never captured.
 */
import { useEffect, useRef } from "react";

export type DraftField = { name: string; i: number; value?: string; checked?: boolean };
export type DraftForm = { key: string; fields: DraftField[] };
export type Draft = { savedAt: string; forms: DraftForm[] };

/** Fired before refilling, so forms with added rows can grow to fit. */
export const DRAFT_ROWS_EVENT = "ogserc:draft-rows";
export type DraftRows = { counts: Record<string, number>; values: Record<string, string[]> };

type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const SKIP_TYPES = new Set(["password", "file", "hidden", "submit", "button", "reset", "image"]);

function isField(el: Element): el is FieldEl {
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
}

function keep(el: FieldEl): boolean {
  if (!el.name || el.disabled) return false;
  if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false;
  return el.autocomplete !== "one-time-code";
}

/** Work forms on the page (search and filter boxes are not work). */
export function workForms(): HTMLFormElement[] {
  return Array.from(document.querySelectorAll("form")).filter((f) => f.getAttribute("role") !== "search");
}

/** A stable-enough name for a form on its page. */
export function formKey(form: HTMLFormElement): string {
  if (form.id) return `#${form.id}`;
  return `@${workForms().indexOf(form)}`;
}

function findForm(key: string): HTMLFormElement | null {
  if (key.startsWith("#")) return document.getElementById(key.slice(1)) as HTMLFormElement | null;
  return workForms()[Number(key.slice(1))] ?? null;
}

function fieldsNamed(form: HTMLFormElement, name: string): FieldEl[] {
  return Array.from(form.elements).filter((e): e is FieldEl => isField(e) && e.name === name);
}

/** The given forms' fields, or null when there is nothing to keep. */
export function captureForms(forms: Iterable<HTMLFormElement>): Draft | null {
  const out: DraftForm[] = [];
  for (const form of forms) {
    if (!form.isConnected) continue;
    const seen = new Map<string, number>();
    const fields: DraftField[] = [];
    for (const el of Array.from(form.elements)) {
      if (!isField(el)) continue;
      const i = seen.get(el.name) ?? 0;
      seen.set(el.name, i + 1);
      if (!keep(el)) continue;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) fields.push({ name: el.name, i, checked: el.checked });
      else fields.push({ name: el.name, i, value: el.value });
    }
    if (fields.some((f) => f.checked || (f.value ?? "") !== "")) out.push({ key: formKey(form), fields });
  }
  return out.length ? { savedAt: new Date().toISOString(), forms: out } : null;
}

function setField(el: FieldEl, f: DraftField) {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    if (f.checked !== undefined && el.checked !== f.checked) el.click();
    return;
  }
  const value = f.value ?? "";
  if (el.value === value) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Refill the page from a draft. Returns how many fields were put back. */
export async function applyDraft(draft: Draft): Promise<number> {
  // The page may still be streaming in: wait (up to 3 s) for the first form it needs.
  const first = draft.forms[0]?.key;
  for (let waited = 0; first && !findForm(first) && waited < 3000; waited += 100) await new Promise((r) => setTimeout(r, 100));
  const rows: DraftRows = { counts: {}, values: {} };
  for (const f of draft.forms.flatMap((x) => x.fields)) {
    rows.counts[f.name] = Math.max(rows.counts[f.name] ?? 0, f.i + 1);
    if (f.value !== undefined) (rows.values[f.name] ??= [])[f.i] = f.value;
  }
  window.dispatchEvent(new CustomEvent<DraftRows>(DRAFT_ROWS_EVENT, { detail: rows }));
  await frame();

  // Several passes: choosing a value (e.g. the filing type) can reveal more fields.
  let pending = draft.forms.flatMap((form) => form.fields.map((field) => ({ key: form.key, field })));
  let applied = 0;
  for (let pass = 0; pass < 4 && pending.length; pass++) {
    const left: typeof pending = [];
    for (const p of pending) {
      const form = findForm(p.key);
      const el = form ? fieldsNamed(form, p.field.name)[p.field.i] : undefined;
      if (!el || !keep(el)) {
        left.push(p);
        continue;
      }
      setField(el, p.field);
      applied += 1;
    }
    pending = left;
    if (pending.length) await frame();
  }
  return applied;
}

/** For forms with added rows: grow the rows before a draft is refilled. */
export function useDraftRows(handler: (rows: DraftRows) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<DraftRows>).detail);
    window.addEventListener(DRAFT_ROWS_EVENT, on);
    return () => window.removeEventListener(DRAFT_ROWS_EVENT, on);
  }, []);
}
