/** Generator units from the own-use form (one row per unit; blank rows ignored). */
export function parseOwnUseUnits(f: FormData) {
  const kws = f.getAll("unitKw").map(String);
  return kws
    .map((kw, i) => ({
      kw: kw.trim() === "" ? NaN : Number(kw.replace(/,/g, "")),
      makeModel: String(f.getAll("unitMake")[i] ?? ""),
      fuel: String(f.getAll("unitFuel")[i] ?? ""),
      avgMwh: (() => {
        const v = String(f.getAll("unitMwh")[i] ?? "").trim();
        return v === "" ? null : Number(v);
      })(),
    }))
    .filter((u, i) => kws[i].trim() !== "" || u.makeModel.trim() !== "");
}
