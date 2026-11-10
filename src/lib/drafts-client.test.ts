// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { applyDraft, captureForms, DRAFT_ROWS_EVENT, workForms, type DraftRows } from "./drafts-client";

afterEach(() => {
  document.body.innerHTML = "";
});

function page(html: string) {
  document.body.innerHTML = html;
  return workForms();
}

describe("capture", () => {
  it("keeps typed fields by name and position; never passwords, files or hidden fields; skips search boxes", () => {
    const forms = page(`
      <form role="search"><input name="q" value="ACK"></form>
      <form id="sub">
        <input name="registeredName" value="Ogun Power Ltd">
        <input name="licenceNo" value="OG/1"><input name="licenceNo" value="OG/2">
        <input type="password" name="pin" value="secret">
        <input type="file" name="upload">
        <input type="hidden" name="id" value="abc">
        <input type="checkbox" name="confirm" checked>
        <select name="lga"><option value="">-</option><option value="Sagamu" selected>Sagamu</option></select>
        <textarea name="remarks">Call back</textarea>
        <input name="locked" value="x" disabled>
        <input type="text" name="shown" value="revealed-secret" data-private>
        <input type="text" name="next" value="new-secret" autocomplete="new-password">
      </form>`);
    expect(forms).toHaveLength(1);
    const d = captureForms(forms)!;
    expect(d.forms).toHaveLength(1);
    expect(d.forms[0].key).toBe("#sub");
    const names = d.forms[0].fields.map((f) => `${f.name}[${f.i}]`);
    expect(names).toEqual(["registeredName[0]", "licenceNo[0]", "licenceNo[1]", "confirm[0]", "lga[0]", "remarks[0]"]);
    expect(JSON.stringify(d)).not.toContain("secret"); // hidden, shown (data-private) and new-password fields alike
    expect(JSON.stringify(d)).not.toContain("abc");
  });

  it("nothing typed means nothing to keep", () => {
    const forms = page(`<form><input name="a" value=""><select name="b"><option value="">-</option></select></form>`);
    expect(captureForms(forms)).toBeNull();
  });
});

describe("refill", () => {
  it("puts values back, announces them, and grows rows first", async () => {
    page(`<form id="sub"><input name="registeredName"><input name="licenceNo"><select name="lga"><option value="">-</option><option>Sagamu</option></select><input type="checkbox" name="confirm"><textarea name="remarks"></textarea></form>`);
    const form = document.getElementById("sub") as HTMLFormElement;
    // A form with added rows makes room when asked (like the licences list).
    let asked: DraftRows | null = null;
    const grow = (e: Event) => {
      asked = (e as CustomEvent<DraftRows>).detail;
      const extra = document.createElement("input");
      extra.name = "licenceNo";
      form.insertBefore(extra, form.querySelector("select"));
    };
    window.addEventListener(DRAFT_ROWS_EVENT, grow, { once: true });
    const inputs: string[] = [];
    form.addEventListener("input", (e) => inputs.push((e.target as HTMLInputElement).name));

    const n = await applyDraft({
      savedAt: new Date().toISOString(),
      forms: [
        {
          key: "#sub",
          fields: [
            { name: "registeredName", i: 0, value: "Ogun Power Ltd" },
            { name: "licenceNo", i: 0, value: "OG/1" },
            { name: "licenceNo", i: 1, value: "OG/2" },
            { name: "lga", i: 0, value: "Sagamu" },
            { name: "confirm", i: 0, checked: true },
            { name: "remarks", i: 0, value: "Call back" },
          ],
        },
      ],
    });
    expect(n).toBe(6);
    expect(asked!.counts.licenceNo).toBe(2);
    const v = (sel: string, i = 0) => (form.querySelectorAll(sel)[i] as HTMLInputElement).value;
    expect(v('[name="registeredName"]')).toBe("Ogun Power Ltd");
    expect([v('[name="licenceNo"]', 0), v('[name="licenceNo"]', 1)]).toEqual(["OG/1", "OG/2"]);
    expect((form.querySelector('[name="lga"]') as HTMLSelectElement).value).toBe("Sagamu");
    expect((form.querySelector('[name="confirm"]') as HTMLInputElement).checked).toBe(true);
    expect(v('[name="remarks"]')).toBe("Call back");
    // React hears an input event for typed fields, so controlled fields keep the value.
    expect(inputs).toContain("registeredName");
  });

  it("fills fields that only appear after an earlier choice", async () => {
    page(`<form id="f"><select name="filingType"><option value="">-</option><option>NEW</option></select></form>`);
    const form = document.getElementById("f") as HTMLFormElement;
    form.querySelector("select")!.addEventListener("change", () => {
      const extra = document.createElement("input");
      extra.name = "cacNo";
      form.appendChild(extra);
    });
    const n = await applyDraft({
      savedAt: new Date().toISOString(),
      forms: [{ key: "#f", fields: [{ name: "cacNo", i: 0, value: "RC123" }, { name: "filingType", i: 0, value: "NEW" }] }],
    });
    expect(n).toBe(2);
    expect((form.querySelector('[name="cacNo"]') as HTMLInputElement).value).toBe("RC123");
  });
});
