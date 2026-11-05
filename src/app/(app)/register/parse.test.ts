import { describe, expect, it } from "vitest";
import { parseSubmission } from "./parse";

describe("submission form parsing", () => {
  it("reads every field the form sends, keeping strings as strings", () => {
    const f = new FormData();
    const set: Record<string, string> = {
      filingType: "NEW",
      formFiled: "REG-01D",
      registeredName: "Test Ltd",
      dateSubmitted: "2026-11-04",
      submissionChannel: "Email",
      cacNo: "RC123",
      phone: "08021846578",
      principalLga: "Sagamu",
      primaryActivity: "GEN",
      installedCapacityMw: "5.5",
      customers: "1,200",
      licenceStatus: "Unlicensed",
      operatingOnEffectiveDate: "N",
      plannedStartDate: "2027-03-01",
      approvedWaiver: "₦100,000.50",
      cond_grid_connected: "N",
      cond_generation_for_sale: "Y",
      cond_sub_franchise: "",
    };
    for (const [k, v] of Object.entries(set)) f.set(k, v);
    f.append("otherActivities", "DIS");
    f.append("otherActivities", "");
    f.append("licenceNo", "OG/1");
    f.append("licenceExpiry", "2030-01-01");
    const p = parseSubmission(f);
    expect(p.phone).toBe("08021846578");
    expect(p.installedCapacityMw).toBe(5.5);
    expect(p.customers).toBe(1200);
    expect(p.approvedWaiver).toBe(10_000_050);
    expect(p.otherActivities).toEqual(["DIS"]);
    expect(p.licences).toEqual([{ licenceNo: "OG/1", expiryDate: "2030-01-01" }]);
    expect(p.conditions).toMatchObject({ grid_connected: false, generation_for_sale: true, sub_franchise: null, multi_state_licensee: null });
    expect(p.conditions).not.toHaveProperty("holds_any_licence");
    expect(p.plannedStartDate).toBe("2027-03-01");
  });
  it("blank numbers are null; junk numbers are NaN so the service rejects them", () => {
    const f = new FormData();
    f.set("installedCapacityMw", "");
    f.set("customers", "lots");
    const p = parseSubmission(f);
    expect(p.installedCapacityMw).toBeNull();
    expect(Number.isNaN(p.customers)).toBe(true);
    expect(p.approvedWaiver).toBe(0);
  });
});
