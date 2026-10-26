import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Webhook } from "svix";
import { Prisma } from "../generated/prisma/client.ts";
import { EmailStatus } from "../generated/prisma/enums.ts";

// Unit tests for POST /api/webhooks/agentmail. Requests are signed for real with svix; Prisma (a fake transaction
// that the real ingestEmail writes to) and the job queue are mocked, and the AgentMail SDK client is spied on, so
// nothing reaches a database or AgentMail.
const createEvents = mock(async () => ({ count: 1 }));
const findEvent = mock();
const findMessage = mock();
const updateMessage = mock();
const findFirstMessage = mock();
const findTicket = mock();
const createTicket = mock();
const updateTicket = mock();
const tx = {
  agentmailEvent: { createMany: createEvents },
  ticketMessage: { findUnique: findMessage, update: updateMessage, findFirst: findFirstMessage },
  ticket: { findUnique: findTicket, create: createTicket, update: updateTicket, updateMany: mock() },
};
mock.module("../db.ts", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    agentmailEvent: { findUnique: findEvent },
    // The AI Agent isn't seeded
    user: { findFirst: async () => null },
  },
}));
const enqueueTicketClassification = mock(async () => {});
mock.module("../lib/jobs.ts", () => ({ enqueueTicketClassification, enqueueTicketAutoResolution: mock() }));

const secret = `whsec_${Buffer.from("agentmail-webhook-test-secret").toString("base64")}`;
process.env.AGENTMAIL_API_KEY = "am_test_key";
process.env.AGENTMAIL_INBOX_ID = "support@agentmail.to";

const { agentmailWebhookRouter } = await import("./agentmail-webhook.ts");
const { agentmailClient } = await import("../lib/agentmail.ts");
const getMessage = spyOn(agentmailClient().inboxes.messages, "get");

let server: Server;
let url: string;

beforeAll(() => {
  const app = express();
  // As mounted in app.ts
  app.use("/api/webhooks/agentmail", express.raw({ type: () => true, limit: "2mb" }), agentmailWebhookRouter);
  server = app.listen(0);
  url = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/agentmail`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  process.env.AGENTMAIL_WEBHOOK_SECRET = secret;
  createEvents.mockReset();
  createEvents.mockImplementation(async () => ({ count: 1 }));
  findEvent.mockReset();
  findMessage.mockReset();
  updateMessage.mockReset();
  for (const fn of [findFirstMessage, findTicket, createTicket, updateTicket]) fn.mockReset();
  // A new email by default: no stored copy, no ticket for its thread
  findFirstMessage.mockResolvedValue(null);
  findTicket.mockResolvedValue(null);
  createTicket.mockResolvedValue({ id: 5 });
  enqueueTicketClassification.mockClear();
  getMessage.mockReset();
});
process.env.AGENTMAIL_WEBHOOK_SECRET = secret;
findFirstMessage.mockResolvedValue(null);
findTicket.mockResolvedValue(null);
createTicket.mockResolvedValue({ id: 5 });

// What the webhook stored for a new ticket
function createdTicket() {
  return createTicket.mock.calls[0]?.[0].data;
}

function post(event: unknown, { signWith = secret, headers = {} as Record<string, string> } = {}) {
  const body = JSON.stringify(event);
  const id = "msg_test";
  const timestamp = new Date();
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(signWith).sign(id, timestamp, body),
      ...headers,
    },
    body,
  });
}

function received(message: Record<string, unknown> = {}, eventId = "evt_1") {
  const now = new Date().toISOString();
  return {
    type: "event",
    event_type: "message.received",
    event_id: eventId,
    message: {
      inbox_id: "support@agentmail.to",
      thread_id: "thr_1",
      message_id: "<abc@mail.example.com>",
      labels: ["received"],
      timestamp: now,
      from: "Carla Customer <carla@example.com>",
      to: ["support@agentmail.to"],
      subject: "Refund",
      text: "Can I get a refund?\n> old",
      extracted_text: "Can I get a refund?",
      size: 100,
      updated_at: now,
      created_at: now,
      ...message,
    },
    thread: {
      inbox_id: "support@agentmail.to",
      thread_id: "thr_1",
      labels: [],
      timestamp: now,
      senders: [],
      recipients: [],
      last_message_id: "<abc@mail.example.com>",
      message_count: 1,
      size: 100,
      updated_at: now,
      created_at: now,
    },
  };
}

function delivery(eventType: string, key: string, extra: Record<string, unknown> = {}, at = new Date()) {
  return {
    type: "event",
    event_type: eventType,
    event_id: `evt_${eventType}`,
    [key]: {
      inbox_id: "support@agentmail.to",
      thread_id: "thr_1",
      message_id: "<reply@agentmail.to>",
      timestamp: at.toISOString(),
      ...extra,
    },
  };
}

describe("signature", () => {
  it("answers 503 while the webhook secret isn't set", async () => {
    delete process.env.AGENTMAIL_WEBHOOK_SECRET;

    const res = await post(received());

    expect(res.status).toBe(503);
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("rejects a request signed with another secret", async () => {
    const res = await post(received(), { signWith: `whsec_${Buffer.from("someone-else").toString("base64")}` });

    expect(res.status).toBe(401);
    expect(createTicket).not.toHaveBeenCalled();
    expect(createEvents).not.toHaveBeenCalled();
  });

  it("rejects a request without signature headers", async () => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

    expect(res.status).toBe(401);
  });

  it("rejects a body changed after signing", async () => {
    const body = JSON.stringify(received());
    const timestamp = new Date();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "svix-id": "msg_test",
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": new Webhook(secret).sign("msg_test", timestamp, body),
      },
      body: body.replace("refund", "r3fund"),
    });

    expect(res.status).toBe(401);
  });
});

describe("message.received", () => {
  it("opens an OPEN ticket for the thread from a verified email and queues its classification", async () => {
    const res = await post(received());

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ticketId: 5, created: true });
    expect(createEvents).toHaveBeenCalledWith({
      data: [{ eventId: "evt_1", eventType: "message.received" }],
      skipDuplicates: true,
    });
    expect(createdTicket()).toMatchObject({
      subject: "Refund",
      fromEmail: "carla@example.com",
      fromName: "Carla Customer",
      agentmailThreadId: "thr_1",
      status: "OPEN",
      messages: {
        create: {
          body: "Can I get a refund?",
          messageId: "<abc@mail.example.com>",
          agentmailMessageId: "<abc@mail.example.com>",
        },
      },
    });
    expect(enqueueTicketClassification).toHaveBeenCalledWith(5);
  });

  it("adds a follow-up in the same thread to its ticket, without queuing anything", async () => {
    findTicket.mockResolvedValue({ id: 5 });

    const res = await post(received({ message_id: "<def@mail.example.com>", extracted_text: "Any news?" }, "evt_2"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticketId: 5, created: false });
    expect(findTicket.mock.calls[0]?.[0].where).toEqual({ agentmailThreadId: "thr_1" });
    expect(updateTicket.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 5 },
      data: { status: "OPEN", messages: { create: { body: "Any news?", agentmailMessageId: "<def@mail.example.com>" } } },
    });
    expect(createTicket).not.toHaveBeenCalled();
    expect(enqueueTicketClassification).not.toHaveBeenCalled();
  });

  it("skips an event it already processed", async () => {
    createEvents.mockImplementation(async () => ({ count: 0 }));

    const res = await post(received());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicate: true });
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("acknowledges the same email delivered by a different event", async () => {
    findFirstMessage.mockResolvedValue({ ticketId: 5 });

    const res = await post(received({}, "evt_other"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticketId: 5, created: false, duplicate: true });
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate delivery that lost a race to the other one", async () => {
    createTicket.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "7" }));
    findEvent.mockResolvedValue({ eventId: "evt_1" });

    const res = await post(received());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicate: true });
  });

  it("answers 500 when two emails of a new thread race, so the loser is redelivered and joins the ticket", async () => {
    createTicket.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "7" }));
    findEvent.mockResolvedValue(null);
    const logged = spyOn(console, "error").mockImplementation(() => {});

    const res = await post(received());

    expect(res.status).toBe(500);
    logged.mockRestore();
  });

  it("answers 500 when processing fails, so AgentMail redelivers it", async () => {
    createTicket.mockRejectedValue(new Error("database down"));
    const logged = spyOn(console, "error").mockImplementation(() => {});

    const res = await post(received());

    expect(res.status).toBe(500);
    // Ids only: never the sender or the body
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("carla");
    logged.mockRestore();
  });

  it("stores an HTML-only email as plain text", async () => {
    await post(
      received({ text: undefined, extracted_text: undefined, html: "<p>Hello <script>x()</script><b>team</b></p>" }),
    );

    expect(createdTicket().messages.create.body).toBe("Hello team");
  });

  it("fetches a body over 64 KiB from the API, and cuts one over 100,000 characters", async () => {
    getMessage.mockResolvedValue({ text: "x".repeat(150_000) } as never);

    const res = await post(received({ text: undefined, extracted_text: undefined, body_url: "https://files.example/b" }));

    expect(res.status).toBe(201);
    expect(getMessage).toHaveBeenCalledWith("support@agentmail.to", "<abc@mail.example.com>");
    expect(createdTicket().messages.create.body).toHaveLength(100_000);
  });

  it("accepts a sender given as from_", async () => {
    await post(received({ from: undefined, from_: "carla@example.com" }));

    expect(createdTicket()).toMatchObject({ fromEmail: "carla@example.com", fromName: "carla" });
  });

  it.each([
    ["another inbox", received({ inbox_id: "other@agentmail.to" })],
    ["our own address", received({ from: "Support <support@agentmail.to>" })],
    ["a sender without a valid address", received({ from: "not an address" })],
  ])("ignores email from %s", async (_label, event) => {
    const warned = spyOn(console, "warn").mockImplementation(() => {});

    const res = await post(event);

    expect(res.status).toBe(204);
    expect(createTicket).not.toHaveBeenCalled();
    warned.mockRestore();
  });

  it("ignores spam and other event types", async () => {
    const res = await post({ ...received(), event_type: "message.received.spam" });

    expect(res.status).toBe(204);
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("answers 500 for a payload the SDK can't read, so it isn't lost", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ type: "event", event_type: "message.received", event_id: "evt_x", message: {} });

    expect(res.status).toBe(500);
    logged.mockRestore();
  });
});

describe("delivery events", () => {
  it("marks a sent reply DELIVERED", async () => {
    findMessage.mockResolvedValue({ id: 7, emailStatus: EmailStatus.SENT });

    const res = await post(delivery("message.delivered", "delivery", { recipients: ["carla@example.com"] }));

    expect(res.status).toBe(200);
    expect(findMessage.mock.calls[0]?.[0].where).toEqual({ agentmailMessageId: "<reply@agentmail.to>" });
    expect(updateMessage).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { emailStatus: EmailStatus.DELIVERED, emailError: null },
    });
  });

  it("marks a reply BOUNCED with the bounce type", async () => {
    findMessage.mockResolvedValue({ id: 7, emailStatus: EmailStatus.DELIVERED });

    await post(
      delivery("message.bounced", "bounce", {
        type: "Permanent",
        sub_type: "NoEmail",
        recipients: [{ address: "carla@example.com", status: "bounced" }],
      }),
    );

    expect(updateMessage).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { emailStatus: EmailStatus.BOUNCED, emailError: "The email bounced (Permanent, NoEmail)" },
    });
  });

  it("marks a reply REJECTED with the reason", async () => {
    findMessage.mockResolvedValue({ id: 7, emailStatus: EmailStatus.SENT });

    await post(delivery("message.rejected", "reject", { reason: "Suppressed address" }));

    expect(updateMessage.mock.calls[0]?.[0].data).toEqual({
      emailStatus: EmailStatus.REJECTED,
      emailError: "AgentMail rejected the email (Suppressed address)",
    });
  });

  it("never moves a bounced reply back to delivered (events arrive out of order)", async () => {
    findMessage.mockResolvedValue({ id: 7, emailStatus: EmailStatus.BOUNCED });

    const res = await post(delivery("message.delivered", "delivery", { recipients: [] }));

    expect(res.status).toBe(200);
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("leaves a message that was never emailed alone", async () => {
    findMessage.mockResolvedValue({ id: 7, emailStatus: null });

    await post(delivery("message.delivered", "delivery", { recipients: [] }));

    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("asks for a retry when a fresh event's reply isn't stored yet", async () => {
    findMessage.mockResolvedValue(null);

    const res = await post(delivery("message.delivered", "delivery", { recipients: [] }));

    expect(res.status).toBe(503);
  });

  it("ignores an old event for mail it didn't send", async () => {
    findMessage.mockResolvedValue(null);

    const res = await post(
      delivery("message.delivered", "delivery", { recipients: [] }, new Date(Date.now() - 60 * 60 * 1000)),
    );

    expect(res.status).toBe(204);
  });

  it("skips a delivery event it already processed", async () => {
    createEvents.mockImplementation(async () => ({ count: 0 }));

    const res = await post(delivery("message.delivered", "delivery", { recipients: [] }));

    expect(res.status).toBe(200);
    expect(findMessage).not.toHaveBeenCalled();
  });
});
