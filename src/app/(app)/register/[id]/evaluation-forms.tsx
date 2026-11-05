"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { assignOfficersAction, confirmCategoryAction } from "../actions";

type Person = { id: string; name: string };

export function OfficersForm({
  id,
  evaluators,
  supervisors,
  approvers,
  current,
}: {
  id: string;
  evaluators: Person[];
  supervisors: Person[];
  approvers: Person[];
  current: { evaluatingOfficerId: string | null; reviewingSupervisorId: string | null; approvingOfficerId: string | null };
}) {
  const rows = [
    ["evaluatingOfficerId", "Evaluating officer", evaluators, current.evaluatingOfficerId],
    ["reviewingSupervisorId", "Reviewing supervisor", supervisors, current.reviewingSupervisorId],
    ["approvingOfficerId", "Approving officer", approvers, current.approvingOfficerId],
  ] as const;
  return (
    <ActionForm action={assignOfficersAction} submitLabel="Save officers" size="sm" hidden={{ id }}>
      {(fe) => (
        <>
          {rows.map(([name, label, list, value]) => (
            <Field key={name} label={label} htmlFor={name} errors={fe[name]}>
              <Select id={name} name={name} defaultValue={value ?? ""}>
                <option value="">Not assigned</option>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          {!evaluators.length || !supervisors.length || !approvers.length ? (
            <p className="text-xs text-warn">Some roles have no active staff yet. An admin assigns roles under Admin › Staff &amp; roles.</p>
          ) : null}
        </>
      )}
    </ActionForm>
  );
}

export function ConfirmCategoryForm({
  id,
  label,
  categories,
  defaultCategory,
  defaultReason,
}: {
  id: string;
  label: string;
  categories: string[];
  defaultCategory: string;
  defaultReason: string;
}) {
  return (
    <ActionForm action={confirmCategoryAction} submitLabel="Confirm category" size="sm" variant="secondary" hidden={{ id }}>
      {(fe) => (
        <>
          <Field label={label} htmlFor="category" errors={fe.category}>
            <Select id="category" name="category" defaultValue={defaultCategory}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason (when it differs from the form filed)" htmlFor="reason" errors={fe.reason}>
            <Input id="reason" name="reason" defaultValue={defaultReason} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
