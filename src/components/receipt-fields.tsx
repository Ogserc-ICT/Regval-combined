import { Field, Input, Select } from "@/components/ui";

/**
 * Date, time and channel received (para 10(3)), for the Register and Own-use forms. They set the
 * deemed receipt date, the ACK year and the days late, so once saved they are shown read-only.
 */
export function ReceiptFields({
  channels,
  dateName,
  today,
  errors,
  saved,
}: {
  channels: string[];
  /** "dateSubmitted" on the Register, "dateFiled" on Own-use. */
  dateName: string;
  today: string;
  errors: Record<string, string[] | undefined>;
  /** When set, the receipt is already recorded and cannot change. */
  saved?: { date: string; time: string; channel: string; deemed: string | null };
}) {
  if (saved) {
    return (
      <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
        <span className="text-sm font-medium text-text">Received</span>
        <p className="text-sm text-muted">
          {saved.date} at {saved.time} · {saved.channel}
          {saved.deemed ? ` · deemed received ${saved.deemed}` : ""} <span className="text-faint">(fixed when first saved)</span>
        </p>
        <input type="hidden" name={dateName} value={saved.date} />
      </div>
    );
  }
  return (
    <>
      <Field label="Date received *" htmlFor={dateName} errors={errors[dateName]}>
        <Input id={dateName} name={dateName} type="date" max={today} defaultValue={today} />
      </Field>
      <Field label="Time received *" htmlFor="timeReceived" errors={errors.timeReceived} hint="24-hour. Email and portal filings at or after the closing time count from the next working day.">
        <Input id="timeReceived" name="timeReceived" type="time" />
      </Field>
      <Field label="Received by *" htmlFor="submissionChannel" errors={errors.submissionChannel}>
        <Select id="submissionChannel" name="submissionChannel" defaultValue="">
          <option value="">—</option>
          {channels.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}
