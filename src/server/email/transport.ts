/**
 * The email adapter ([G9]; docs/PLAN.md §1). One interface, chosen by
 * EMAIL_PROVIDER: "console" (development: logs instead of sending),
 * "resend" (production, via the Resend HTTP API) or "memory" (tests).
 * A Microsoft Graph provider can be added behind the same interface (Q19).
 */
export type OutgoingEmail = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
};

export type SendResult = { id: string };

export interface EmailTransport {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SendResult>;
}

class ConsoleTransport implements EmailTransport {
  readonly name = "console";
  async send(email: OutgoingEmail): Promise<SendResult> {
    const files = (email.attachments ?? []).map((a) => `${a.filename} (${a.content.length} bytes)`).join(", ");
    console.info(`[email:console] To: ${email.to.join(", ")}${email.cc.length ? ` | Cc: ${email.cc.join(", ")}` : ""}\nSubject: ${email.subject}\n${email.text}${files ? `\nAttachments: ${files}` : ""}`);
    return { id: `console-${Date.now()}` };
  }
}

/** Kept in memory for tests: `memoryOutbox` lists what was "sent". */
export const memoryOutbox: OutgoingEmail[] = [];
class MemoryTransport implements EmailTransport {
  readonly name = "memory";
  async send(email: OutgoingEmail): Promise<SendResult> {
    if (email.to.some((a) => a.includes("fail@"))) throw new Error("Simulated provider failure");
    memoryOutbox.push(email);
    return { id: `memory-${memoryOutbox.length}` };
  }
}

class ResendTransport implements EmailTransport {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(email: OutgoingEmail): Promise<SendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: email.to,
        cc: email.cc.length ? email.cc : undefined,
        subject: email.subject,
        text: email.text,
        attachments: (email.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "send failed"}`);
    return { id: body.id };
  }
}

export function emailTransport(env: NodeJS.ProcessEnv = process.env): EmailTransport {
  const provider = (env.EMAIL_PROVIDER ?? "console").toLowerCase();
  if (provider === "memory") return new MemoryTransport();
  if (provider === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("EMAIL_PROVIDER=resend needs RESEND_API_KEY");
    return new ResendTransport(env.RESEND_API_KEY, env.EMAIL_FROM || "registry@ogserc.org.ng");
  }
  return new ConsoleTransport();
}
