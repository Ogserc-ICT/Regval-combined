import { and, eq, inArray } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardBody, CardHeader, Field, FormErrors, Input, Notice, Select, Textarea } from "@/components/ui";
import { AUTO_CHECKS } from "@/domain/registration/checks";
import { dateLong } from "@/lib/format";
import { can, type Actor } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import { userRoles, users } from "@/server/db/schema";
import { listValues } from "@/server/services/reference";
import type { LoadedSubmission } from "@/server/services/submissions/load";
import {
  answerChecksAction,
  approveAction,
  cancelAction,
  certificateSentAction,
  deficiencyAction,
  deficiencySentAction,
  flagReasonAction,
  lapseAction,
  markCompleteAction,
  recalculateAction,
  refuseAction,
  showCauseAction,
} from "../actions";
import { ConfirmCategoryForm, OfficersForm } from "./evaluation-forms";

async function officers() {
  const rows = await db
    .select({ id: users.id, name: users.name, role: userRoles.role })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(users.active, true), inArray(userRoles.role, ["evaluator", "supervisor", "approver"])));
  const by = (role: string) => rows.filter((r) => r.role === role).sort((a, b) => a.name.localeCompare(b.name));
  return { evaluator: by("evaluator"), supervisor: by("supervisor"), approver: by("approver"), all: rows };
}

function ValueBadge({ v }: { v: string }) {
  if (v === "Y") return <Badge tone="accent">Y</Badge>;
  if (v === "N") return <Badge tone="danger">N</Badge>;
  if (v === "N/A") return <Badge>N/A</Badge>;
  return <Badge tone="warn">Pending</Badge>;
}

export async function EvaluationTab({ l, actor }: { l: LoadedSubmission; actor: Actor }) {
  const { row, a } = l;
  const ev = l.evaluation;
  const [people, grounds] = await Promise.all([officers(), listValues(db, "refusal_ground")]);
  const nameOf = (id: string | null | undefined) => people.all.find((p) => p.id === id)?.name ?? (id ? "(inactive account)" : "Not assigned");
  const isEval = actor.id === ev?.evaluatingOfficerId;
  const isSup = actor.id === ev?.reviewingSupervisorId;
  const isAppr = actor.id === ev?.approvingOfficerId;
  const open = !a.closed && !ev?.finalDecision && !!row.status;
  const canCheck = open && (isEval || isSup) && can(actor, "evaluation:check");
  const hidden = { id: row.id };
  const stages = [...new Set(l.ref.checks.map((c) => c.stage))];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Officers" description="Four different people: evaluator, supervisor, approver and whoever saved the submission." />
          <CardBody>
            {can(actor, "evaluation:assign") && open ? (
              <OfficersForm
                id={row.id}
                evaluators={people.evaluator}
                supervisors={people.supervisor}
                approvers={people.approver}
                current={{ evaluatingOfficerId: ev?.evaluatingOfficerId ?? null, reviewingSupervisorId: ev?.reviewingSupervisorId ?? null, approvingOfficerId: ev?.approvingOfficerId ?? null }}
              />
            ) : (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-muted">Evaluating officer</dt><dd>{nameOf(ev?.evaluatingOfficerId)}</dd></div>
                <div><dt className="text-muted">Reviewing supervisor</dt><dd>{nameOf(ev?.reviewingSupervisorId)}</dd></div>
                <div><dt className="text-muted">Approving officer</dt><dd>{nameOf(ev?.approvingOfficerId)}</dd></div>
              </dl>
            )}
            <p className="mt-3 text-xs text-faint">Saved by {row.createdByName ?? "—"} · evaluation started {dateLong(ev?.startedOn)}</p>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={`EVAL-01 · ${a.evaluationStatus}`} description={`${Math.round(a.checks.progress * 100)}% done · ${a.checks.satisfied} satisfied · ${a.checks.failed} failed · ${a.checks.notApplicable} N/A · ${a.checks.pending} pending`} />
          <CardBody className="flex flex-col gap-3">
            <Notice tone={a.recommendedOutcome.startsWith("Register") || a.recommendedOutcome.startsWith("Accept") ? "accent" : "info"} title="Recommended outcome">
              {a.recommendedOutcome}
            </Notice>
            {ev?.finalDecision ? (
              <Notice tone="accent" title="Final decision">
                {ev.finalDecision} · {dateLong(ev.approvalDate)}
                {ev.reasons ? ` · ${ev.reasons}` : ""}
              </Notice>
            ) : a.approvalBlockers.length ? (
              <FormErrors reasons={a.approvalBlockers} />
            ) : (
              <Notice tone="accent">Nothing blocks approval.</Notice>
            )}
          </CardBody>
        </Card>
      </div>

      {can(actor, "letters:record-sent") && (row.status === "Deficiency Notice Issued" || row.certificateIssueDate) ? (
        <Card>
          <CardHeader title="Letters sent" description="No Registry numbers or dispatches these now: record the date each one actually went out." />
          <CardBody className="grid gap-6 md:grid-cols-2">
            {row.status === "Deficiency Notice Issued" ? (
              row.deficiencyNoticeDate ? (
                <p className="text-sm">
                  Deficiency notice sent on <span className="font-medium">{dateLong(row.deficiencyNoticeDate)}</span>; response due {dateLong(a.deficiencyResponseDue)}.
                </p>
              ) : (
                <div>
                  <p className="mb-2 text-sm font-medium">Deficiency notice sent on</p>
                  <p className="mb-2 text-xs text-muted">Starts the {l.settings.deficiencyResponseDays}-day response period (para 13(1)(b)). Fixed once saved.</p>
                  <ActionForm action={deficiencySentAction} submitLabel="Save sent date" size="sm" variant="secondary" hidden={hidden} inline>
                    <Input name="sentOn" type="date" max={l.ctx.today} defaultValue={l.ctx.today} className="h-8 w-44" aria-label="Deficiency notice sent on" />
                  </ActionForm>
                </div>
              )
            ) : null}
            {row.certificateIssueDate ? (
              row.certificateSentOn ? (
                <p className="text-sm">
                  Certificate issued {dateLong(row.certificateIssueDate)}, sent on <span className="font-medium">{dateLong(row.certificateSentOn)}</span>.
                </p>
              ) : (
                <div>
                  <p className="mb-2 text-sm font-medium">Certificate sent on</p>
                  <p className="mb-2 text-xs text-muted">Issued {dateLong(row.certificateIssueDate)}. Fixed once saved.</p>
                  <ActionForm action={certificateSentAction} submitLabel="Save sent date" size="sm" variant="secondary" hidden={hidden} inline>
                    <Input name="sentOn" type="date" max={l.ctx.today} defaultValue={l.ctx.today} className="h-8 w-44" aria-label="Certificate sent on" />
                  </ActionForm>
                </div>
              )
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Decisions" description="Each action lists every reason it is blocked." />
        <CardBody className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {open && (isEval || isSup) ? (
            <div>
              <p className="mb-2 text-sm font-medium">Confirm category</p>
              <ConfirmCategoryForm
                id={row.id}
                label={`Form filed: ${row.formFiled} (Category ${a.formCategory}); calculated: ${a.categoryAuto ?? "?"}`}
                categories={l.ref.fees.filter((f) => f.category !== "I").map((f) => f.category)}
                defaultCategory={row.confirmedCategory ?? a.categoryAuto ?? ""}
                defaultReason={row.categoryConfirmedReason ?? ""}
              />
            </div>
          ) : null}
          {open && (isEval || isSup) ? (
            <div>
              <p className="mb-2 text-sm font-medium">Mark complete</p>
              <p className="mb-2 text-xs text-muted">
                Starts the {l.settings.determinationDays}-day determination clock (para 13(1)); a deficiency notice never restarts it.
                {row.status === "Deficiency Notice Issued" ? " The response to the deficiency notice clears it: give the date it was received." : ""}
              </p>
              <ActionForm action={markCompleteAction} submitLabel="Mark complete" size="sm" variant="secondary" hidden={hidden}>
                {(fe) =>
                  row.status === "Deficiency Notice Issued" ? (
                    <Field label="Response received on *" htmlFor="responseReceivedOn" errors={fe.responseReceivedOn}>
                      <Input id="responseReceivedOn" name="responseReceivedOn" type="date" max={l.ctx.today} className="h-8 w-44" />
                    </Field>
                  ) : null
                }
              </ActionForm>
            </div>
          ) : null}
          {open && isSup && row.status !== "Deficiency Notice Issued" ? (
            <div>
              <p className="mb-2 text-sm font-medium">Deficiency notice (para 13(1)(b))</p>
              <p className="mb-2 text-xs text-muted">The {l.settings.deficiencyResponseDays}-day response period starts on the date the notice is sent, recorded below.</p>
              <ActionForm action={deficiencyAction} submitLabel="Issue deficiency notice" size="sm" variant="secondary" hidden={hidden} />
            </div>
          ) : null}
          {!a.closed && (isAppr || isSup) ? (
            <div>
              <p className="mb-2 text-sm font-medium">Explain the data flags ({a.flags.length})</p>
              <ActionForm action={flagReasonAction} submitLabel="Save reason" size="sm" variant="secondary" hidden={hidden}>
                <Textarea name="reason" defaultValue={ev?.flagOverrideReason ?? ""} placeholder="Written reason the flags do not stop approval" aria-label="Flag override reason" />
              </ActionForm>
            </div>
          ) : null}
          {!a.closed && isAppr ? (
            <div>
              <p className="mb-2 text-sm font-medium">{row.filingType === "NEW" ? "Approve and register" : "Approve and apply the changes"}</p>
              <ActionForm action={approveAction} submitLabel={row.filingType === "NEW" ? "Approve and register" : "Apply changes"} size="sm" hidden={hidden} />
            </div>
          ) : null}
          {!a.closed && isAppr && row.status === "Deficiency Notice Issued" ? (
            <div>
              <p className="mb-2 text-sm font-medium">Lapse (para 13(2))</p>
              <p className="mb-2 text-xs text-muted">Only after the response period ({dateLong(a.deficiencyResponseDue)}).</p>
              <ActionForm action={lapseAction} submitLabel="Treat as lapsed" size="sm" variant="secondary" hidden={hidden} />
            </div>
          ) : null}
          {!a.closed && (isAppr || isSup) ? (
            <div>
              <p className="mb-2 text-sm font-medium">Show-cause letter sent on (para 20)</p>
              <p className="mb-2 text-xs text-muted">The {l.settings.showCauseDays}-day show-cause period runs from this date.</p>
              <ActionForm action={showCauseAction} submitLabel="Save date" size="sm" variant="secondary" hidden={hidden} inline>
                <Input name="date" type="date" max={l.ctx.today} defaultValue={row.showCauseDate ?? ""} className="h-8 w-44" aria-label="Show-cause letter sent on" />
              </ActionForm>
            </div>
          ) : null}
          {!a.closed && isAppr ? (
            <div>
              <p className="mb-2 text-sm font-medium">Refuse (paras 13(3), 20)</p>
              <ActionForm action={refuseAction} submitLabel="Refuse" size="sm" variant="danger" hidden={hidden}>
                <Select name="ground" aria-label="Ground">
                  {grounds.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </Select>
                <Input name="details" placeholder="Details (optional)" />
              </ActionForm>
            </div>
          ) : null}
          {can(actor, "submission:cancel") && !a.closed && row.status ? (
            <div>
              <p className="mb-2 text-sm font-medium">Cancel (Admin, para 14)</p>
              <ActionForm action={cancelAction} submitLabel="Cancel submission" size="sm" variant="danger" hidden={hidden}>
                <Input name="reason" placeholder="Reason (required)" required />
              </ActionForm>
            </div>
          ) : null}
          {can(actor, "pricing:recalculate") && !row.registrationNo && row.status ? (
            <div>
              <p className="mb-2 text-sm font-medium">Recalculate pricing (Admin)</p>
              <ActionForm action={recalculateAction} submitLabel="Recalculate" size="sm" variant="secondary" hidden={hidden}>
                <Input name="reason" placeholder="Reason (required)" required />
              </ActionForm>
            </div>
          ) : null}
          {!(isEval || isSup || isAppr) && !can(actor, "submission:cancel") ? (
            <p className="text-sm text-muted">Only the assigned officers can act on this evaluation.</p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Checks" description="Grey checks are automatic or do not apply. Answer the rest Y, N or N/A." />
        <CardBody>
          <ChecksWrapper enabled={!!canCheck} id={row.id}>
            <div className="flex flex-col gap-6">
              {stages.map((stage) => (
                <div key={stage}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">{stage}</p>
                  <div className="divide-y divide-border/60 rounded-lg border border-border">
                    {l.ref.checks
                      .filter((c) => c.stage === stage)
                      .map((c) => {
                        const r = a.checks.results.find((x) => x.id === c.id);
                        const editable = canCheck && r?.applicable && !AUTO_CHECKS.has(c.id);
                        return (
                          <div key={c.id} className="grid items-center gap-2 px-3 py-2 md:grid-cols-[3rem_1fr_9rem]">
                            <span className="font-mono text-xs text-faint">{c.id}</span>
                            <div>
                              <p className="text-sm">{c.text}</p>
                              <p className="text-xs text-faint">{c.ruleText}</p>
                            </div>
                            <div className="md:justify-self-end">
                              {editable ? (
                                <Select name={`check_${c.id}`} defaultValue={l.answers[c.id] ?? ""} className="h-8 w-32" aria-label={`Check ${c.id}`}>
                                  <option value="">Pending</option>
                                  <option value="Y">Y</option>
                                  <option value="N">N</option>
                                  <option value="N/A">N/A</option>
                                </Select>
                              ) : (
                                <ValueBadge v={r?.value ?? ""} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
              {canCheck ? (
                <Field label="Evaluation remarks" htmlFor="remarks">
                  <Textarea id="remarks" name="remarks" defaultValue={ev?.remarks ?? ""} />
                </Field>
              ) : null}
            </div>
          </ChecksWrapper>
        </CardBody>
      </Card>
    </div>
  );
}

function ChecksWrapper({ enabled, id, children }: { enabled: boolean; id: string; children: React.ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <ActionForm action={answerChecksAction} submitLabel="Save answers" hidden={{ id }}>
      {children}
    </ActionForm>
  );
}
