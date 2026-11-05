/**
 * Service errors. Every blocked action carries every reason at once, as the
 * workbook buttons do (SPEC §1). Server actions turn them into an
 * ActionResult; route handlers into an HTTP status.
 */

export type FailureKind = "unauthenticated" | "forbidden" | "invalid" | "blocked" | "not_found";

const STATUS: Record<FailureKind, number> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid: 422,
  blocked: 409,
  not_found: 404,
};

export class ServiceError extends Error {
  readonly kind: FailureKind;
  readonly reasons: string[];
  readonly fieldErrors: Record<string, string[]>;

  constructor(kind: FailureKind, reasons: string[], fieldErrors: Record<string, string[]> = {}) {
    super(reasons.join("; ") || kind);
    this.name = "ServiceError";
    this.kind = kind;
    this.reasons = reasons;
    this.fieldErrors = fieldErrors;
  }

  get status(): number {
    return STATUS[this.kind];
  }
}

export const forbidden = (...reasons: string[]) => new ServiceError("forbidden", reasons);
export const blocked = (...reasons: string[]) => new ServiceError("blocked", reasons);
export const notFound = (what: string) => new ServiceError("not_found", [`${what} not found`]);
export const invalid = (fieldErrors: Record<string, string[]>, reasons: string[] = []) =>
  new ServiceError("invalid", reasons.length ? reasons : ["Please correct the highlighted fields."], fieldErrors);

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string; warnings?: string[] }
  | { ok: false; kind: FailureKind; status: number; reasons: string[]; fieldErrors: Record<string, string[]> };

/** Run a service call and turn ServiceErrors into a failed ActionResult. Other errors propagate. */
export async function toResult<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof ServiceError) {
      return { ok: false, kind: e.kind, status: e.status, reasons: e.reasons, fieldErrors: e.fieldErrors };
    }
    throw e;
  }
}

/** Collects field errors and reasons, then throws them all together. */
export class Problems {
  readonly fields: Record<string, string[]> = {};
  readonly reasons: string[] = [];

  field(name: string, message: string): this {
    (this.fields[name] ??= []).push(message);
    return this;
  }

  reason(message: string): this {
    this.reasons.push(message);
    return this;
  }

  get any(): boolean {
    return this.reasons.length > 0 || Object.keys(this.fields).length > 0;
  }

  throwIfAny(kind: "invalid" | "blocked" | "forbidden" = "invalid"): void {
    if (!this.any) return;
    if (kind === "invalid") throw invalid(this.fields, this.reasons);
    const all = [...this.reasons, ...Object.values(this.fields).flat()];
    throw new ServiceError(kind, all, this.fields);
  }
}
