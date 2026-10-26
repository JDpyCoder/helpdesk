import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import { AgentMailError, AgentMailTimeoutError } from "agentmail";
import { EmailStatus, SenderType } from "../generated/prisma/enums.ts";

// AgentMail is never called: the SDK client's methods are replaced with spies, and Prisma is mocked
const findMessage = mock();
const findFirstMessage = mock();
const updateMessages = mock(async (_args: { where: unknown; data: unknown }) => ({ count: 1 }));
mock.module("../db.ts", () => ({
  prisma: { ticketMessage: { findUnique: findMessage, findFirst: findFirstMessage, updateMany: updateMessages } },
}));

process.env.AGENTMAIL_API_KEY = "am_test_key";
process.env.AGENTMAIL_INBOX_ID = "Support@AgentMail.to";

const { agentmailClient, htmlToText, maskEmail, messageBody, parseAddress, parseAgentmailEvent, sendReplyEmail } =
  await import("./agentmail.ts");

const messages = agentmailClient().inboxes.messages;
const reply = spyOn(messages, "reply");
const getMessage = spyOn(messages, "get");

beforeAll(() => {
  reply.mockImplementation((() => {
    throw new Error("reply not stubbed");
  }) as never);
  getMessage.mockImplementation((() => {
    throw new Error("get not stubbed");
  }) as never);
});

afterEach(() => {
  findMessage.mockReset();
  findFirstMessage.mockReset();
  updateMessages.mockClear();
  reply.mockReset();
  getMessage.mockReset();
});

// A message.received payload as AgentMail sends it (snake_case)
function receivedPayload(message: Record<string, unknown> = {}) {
  return {
    type: "event",
    event_type: "message.received",
    event_id: "evt_1",
    message: {
      inbox_id: "support@agentmail.to",
      thread_id: "thr_1",
      message_id: "<abc@agentmail.to>",
      labels: ["received"],
      timestamp: "2026-10-26T10:00:00Z",
      from: "Carla Customer <Carla@Example.com>",
      to: ["support@agentmail.to"],
      subject: "Refund",
      text: "Full text\n> quoted",
      extracted_text: "Full text",
      size: 1200,
      updated_at: "2026-10-26T10:00:00Z",
      created_at: "2026-10-26T10:00:00Z",
      ...message,
    },
    thread: {
      inbox_id: "support@agentmail.to",
      thread_id: "thr_1",
      labels: ["received"],
      timestamp: "2026-10-26T10:00:00Z",
      senders: ["carla@example.com"],
      recipients: ["support@agentmail.to"],
      last_message_id: "<abc@agentmail.to>",
      message_count: 1,
      size: 1200,
      updated_at: "2026-10-26T10:00:00Z",
      created_at: "2026-10-26T10:00:00Z",
    },
  };
}

describe("parseAgentmailEvent", () => {
  it("parses message.received with the SDK schema into camelCase fields", () => {
    const event = parseAgentmailEvent(receivedPayload());

    expect(event.eventType).toBe("message.received");
    if (event.eventType !== "message.received") return;
    expect(event.eventId).toBe("evt_1");
    expect(event.message.threadId).toBe("thr_1");
    expect(event.message.extractedText).toBe("Full text");
    expect(event.message.timestamp).toBeInstanceOf(Date);
  });

  it("accepts the sender as from_, as some AgentMail docs show it", () => {
    const payload = receivedPayload({ from: undefined, from_: "Carla <carla@example.com>" });

    const event = parseAgentmailEvent(payload);

    expect(event.eventType === "message.received" && event.message.from).toBe("Carla <carla@example.com>");
  });

  it("keeps fields the SDK doesn't know, such as body_url", () => {
    const payload = receivedPayload({ text: undefined, extracted_text: undefined, body_url: "https://example.com/b" });

    expect(() => parseAgentmailEvent(payload)).not.toThrow();
  });

  it("parses delivery events", () => {
    const event = parseAgentmailEvent({
      type: "event",
      event_type: "message.bounced",
      event_id: "evt_2",
      bounce: {
        inbox_id: "support@agentmail.to",
        thread_id: "thr_1",
        message_id: "<reply@agentmail.to>",
        timestamp: "2026-10-26T10:00:00Z",
        type: "Permanent",
        sub_type: "General",
        recipients: [{ address: "carla@example.com", status: "bounced" }],
      },
    });

    expect(event.eventType === "message.bounced" && event.bounce.subType).toBe("General");
  });

  it("marks event types it doesn't handle as ignored", () => {
    expect(parseAgentmailEvent({ event_type: "message.received.spam", event_id: "evt_3" })).toEqual({
      eventType: "ignored",
      eventId: "evt_3",
      type: "message.received.spam",
    });
  });

  it("rejects an event without event_id, and one that doesn't match the schema", () => {
    expect(() => parseAgentmailEvent({ event_type: "message.received" })).toThrow();
    expect(() => parseAgentmailEvent({ event_type: "message.received", event_id: "evt_4", message: {} })).toThrow();
  });
});

describe("parseAddress and maskEmail", () => {
  it("reads a display name and lowercases the address", () => {
    expect(parseAddress('"Carla Customer" <Carla@Example.com>')).toEqual({
      name: "Carla Customer",
      email: "carla@example.com",
    });
  });

  it("falls back to the local part when there is no name", () => {
    expect(parseAddress("carla@example.com")).toEqual({ name: "carla", email: "carla@example.com" });
  });

  it("masks addresses for logs", () => {
    expect(maskEmail("carla@example.com")).toBe("c***@example.com");
  });
});

describe("htmlToText", () => {
  it("drops scripts, styles and tags and keeps the text with line breaks", () => {
    const html =
      '<html><head><style>p{}</style></head><body><script>alert(1)</script><p>Hi&nbsp;there &amp; <b>thanks</b></p>' +
      '<ul><li>One</li><li>Two</li></ul>Line<br>break <img src="https://tracker.example/x.png" onerror="alert(1)"></body></html>';

    expect(htmlToText(html)).toBe("Hi there & thanks\n\n- One\n- Two\nLine\nbreak");
  });

  it("decodes numeric entities and leaves unknown ones as they are", () => {
    expect(htmlToText("&#233;&#x1F600; &bogus; &lt;b&gt;")).toBe("é😀 &bogus; <b>");
  });
});

describe("messageBody", () => {
  const base = { inboxId: "support@agentmail.to", messageId: "<abc@agentmail.to>" };

  it("prefers extracted_text, then text, then the HTML as text", async () => {
    expect(await messageBody({ ...base, extractedText: "New part", text: "All" } as never)).toBe("New part");
    expect(await messageBody({ ...base, text: "All" } as never)).toBe("All");
    expect(await messageBody({ ...base, html: "<p>Only <i>HTML</i></p>" } as never)).toBe("Only HTML");
    expect(getMessage).not.toHaveBeenCalled();
  });

  it("fetches the message from the API when the payload left the body out (over 64 KiB)", async () => {
    getMessage.mockResolvedValue({ ...base, text: "A very long body" } as never);

    expect(await messageBody(base as never)).toBe("A very long body");
    expect(getMessage).toHaveBeenCalledWith("support@agentmail.to", "<abc@agentmail.to>");
  });
});

describe("sendReplyEmail", () => {
  const pendingReply = { id: 7, body: "We refunded you.", emailStatus: EmailStatus.PENDING, ticketId: 3 };

  function stubReply() {
    findMessage.mockResolvedValue(pendingReply);
    findFirstMessage.mockResolvedValue({ agentmailMessageId: "<latest@agentmail.to>" });
  }

  it("replies to the latest customer email with an idempotency key and marks the reply SENT", async () => {
    stubReply();
    reply.mockResolvedValue({ messageId: "<sent@agentmail.to>", threadId: "thr_1" } as never);

    await sendReplyEmail(7);

    expect(findFirstMessage.mock.calls[0]?.[0].where).toEqual({
      ticketId: 3,
      senderType: SenderType.CUSTOMER,
      agentmailMessageId: { not: null },
    });
    expect(reply).toHaveBeenCalledWith(
      "support@agentmail.to",
      "<latest@agentmail.to>",
      { text: "We refunded you." },
      { idempotencyKey: "ticket-message-7" },
    );
    expect(updateMessages).toHaveBeenCalledWith({
      where: { id: 7, emailStatus: EmailStatus.PENDING },
      data: { emailStatus: EmailStatus.SENT, emailError: null, agentmailMessageId: "<sent@agentmail.to>" },
    });
  });

  it.each([
    ["an HTTP error", new AgentMailError({ message: "nope", statusCode: 403 }), "AgentMail refused the API key (HTTP 403)"],
    ["the daily limit", new AgentMailError({ message: "limit", statusCode: 429 }), "AgentMail's sending limit was reached (HTTP 429)"],
    ["a timeout", new AgentMailTimeoutError("timeout"), "AgentMail did not answer in time"],
    ["a network error", new TypeError("fetch failed"), "Could not reach AgentMail"],
  ])("marks the reply FAILED with a reason on %s", async (_label, err, reason) => {
    stubReply();
    reply.mockRejectedValue(err as never);
    const logged = spyOn(console, "error").mockImplementation(() => {});

    await sendReplyEmail(7);

    expect(updateMessages).toHaveBeenCalledWith({
      where: { id: 7, emailStatus: EmailStatus.PENDING },
      data: { emailStatus: EmailStatus.FAILED, emailError: reason },
    });
    // Ids and the reason only, never the address or the body
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("refunded");
    logged.mockRestore();
  });

  it("uses the same idempotency key when a failed reply is sent again", async () => {
    stubReply();
    reply.mockRejectedValueOnce(new AgentMailTimeoutError("timeout") as never);
    reply.mockResolvedValueOnce({ messageId: "<sent@agentmail.to>", threadId: "thr_1" } as never);
    const logged = spyOn(console, "error").mockImplementation(() => {});

    await sendReplyEmail(7);
    await sendReplyEmail(7);

    expect(reply.mock.calls.map((call) => call[3])).toEqual([
      { idempotencyKey: "ticket-message-7" },
      { idempotencyKey: "ticket-message-7" },
    ]);
    logged.mockRestore();
  });

  it("fails without calling AgentMail when the ticket has no AgentMail customer email", async () => {
    findMessage.mockResolvedValue(pendingReply);
    findFirstMessage.mockResolvedValue(null);

    await sendReplyEmail(7);

    expect(reply).not.toHaveBeenCalled();
    expect(updateMessages.mock.calls[0]?.[0].data).toMatchObject({ emailStatus: EmailStatus.FAILED });
  });

  it("does nothing for a reply that isn't PENDING", async () => {
    findMessage.mockResolvedValue({ ...pendingReply, emailStatus: EmailStatus.SENT });

    await sendReplyEmail(7);

    expect(reply).not.toHaveBeenCalled();
    expect(updateMessages).not.toHaveBeenCalled();
  });
});
