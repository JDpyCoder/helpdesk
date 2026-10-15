import { describe, expect, it } from "bun:test";
import { ticketsPerDayQuerySchema } from "./dashboard.ts";

describe("ticketsPerDayQuerySchema", () => {
  it("accepts an IANA time zone, trimmed", () => {
    expect(ticketsPerDayQuerySchema.parse({ timeZone: " America/New_York " })).toEqual({ timeZone: "America/New_York" });
  });

  it("defaults to UTC", () => {
    expect(ticketsPerDayQuerySchema.parse({})).toEqual({ timeZone: "UTC" });
  });

  it.each(["Mars/Olympus_Mons", "", "x".repeat(101)])("rejects %p", (timeZone) => {
    expect(ticketsPerDayQuerySchema.safeParse({ timeZone }).success).toBe(false);
  });
});
