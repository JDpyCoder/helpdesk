import { describe, expect, it } from "bun:test";
import { createReplySchema, polishReplySchema, REPLY_MIN_LENGTH, updateTicketSchema } from "./tickets.ts";

// The reply length rules shared by POST /api/tickets/:id/replies, .../replies/polish and the client's reply form
describe("createReplySchema", () => {
  it("has a minimum of 5 characters", () => {
    expect(REPLY_MIN_LENGTH).toBe(5);
  });

  it("accepts a reply of exactly the minimum length", () => {
    expect(createReplySchema.safeParse({ body: "On it" })).toEqual({ success: true, data: { body: "On it" } });
  });

  it("rejects a reply one character short of the minimum", () => {
    const result = createReplySchema.safeParse({ body: "Okay" });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["body"], message: "Reply must be at least 5 characters" }),
    ]);
  });

  it("counts characters after trimming, and returns the trimmed reply", () => {
    expect(createReplySchema.safeParse({ body: "  \n Okay \t " }).success).toBe(false);
    expect(createReplySchema.safeParse({ body: "  On it  \n" })).toEqual({ success: true, data: { body: "On it" } });
  });

  it("rejects a blank reply with the same single message", () => {
    const result = createReplySchema.safeParse({ body: "    " });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Reply must be at least 5 characters"]);
  });

  it("rejects a missing or non-string body", () => {
    expect(createReplySchema.safeParse({}).success).toBe(false);
    expect(createReplySchema.safeParse({ body: 12345 }).success).toBe(false);
  });

  it("accepts 10,000 characters and rejects 10,001", () => {
    expect(createReplySchema.safeParse({ body: "a".repeat(10000) }).success).toBe(true);

    const result = createReplySchema.safeParse({ body: "a".repeat(10001) });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Reply must be at most 10,000 characters"]);
  });
});

describe("polishReplySchema", () => {
  it("applies the same minimum as a reply", () => {
    expect(polishReplySchema.safeParse({ body: "Okay" }).success).toBe(false);
    expect(polishReplySchema.safeParse({ body: " On it " })).toEqual({ success: true, data: { body: "On it" } });
  });
});

// The statuses PATCH /api/tickets/:id accepts
describe("updateTicketSchema status", () => {
  it("accepts the statuses an agent can set", () => {
    for (const status of ["OPEN", "RESOLVED", "CLOSED"]) {
      expect(updateTicketSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects NEW and PROCESSING, which only AI auto-resolution sets", () => {
    for (const status of ["NEW", "PROCESSING"]) {
      expect(updateTicketSchema.safeParse({ status }).success).toBe(false);
    }
  });
});
