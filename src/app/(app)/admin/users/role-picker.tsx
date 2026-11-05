import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/domain/roles";

export function RolePicker({ selected = [] }: { selected?: Role[] }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Roles</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <label key={r} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 hover:bg-surface-hover has-checked:border-accent/50 has-checked:bg-accent-soft">
            <input type="checkbox" name="roles" value={r} defaultChecked={selected.includes(r)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-medium">{ROLE_LABELS[r]}</span>
              <span className="block text-xs text-muted">{ROLE_DESCRIPTIONS[r]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
