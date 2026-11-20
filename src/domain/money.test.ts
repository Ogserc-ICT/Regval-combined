import { describe, expect, it } from "vitest";
import { nairaInWords, numberInWords } from "./money";

describe("numberInWords", () => {
  it.each([
    [0, "Zero"],
    [5, "Five"],
    [19, "Nineteen"],
    [21, "Twenty-One"],
    [100, "One Hundred"],
    [105, "One Hundred and Five"],
    [1_005, "One Thousand and Five"],
    [1_100, "One Thousand, One Hundred"],
    [250_000, "Two Hundred and Fifty Thousand"],
    [1_000_000, "One Million"],
    [1_250_075, "One Million, Two Hundred and Fifty Thousand and Seventy-Five"],
    [2_000_300, "Two Million, Three Hundred"],
  ])("%i", (n, words) => expect(numberInWords(n)).toBe(words));

  it("rejects negatives and fractions", () => {
    expect(() => numberInWords(-1)).toThrow(RangeError);
    expect(() => numberInWords(1.5)).toThrow(RangeError);
  });
});

describe("nairaInWords", () => {
  it("whole naira", () => expect(nairaInWords(25_000_000)).toBe("Two Hundred and Fifty Thousand Naira Only"));
  it("with kobo", () => expect(nairaInWords(150_050)).toBe("One Thousand, Five Hundred Naira and Fifty Kobo Only"));
});
