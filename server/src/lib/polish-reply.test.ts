import { afterEach, describe, expect, it, mock } from "bun:test";
import { SenderType } from "../generated/prisma/enums.ts";

// Gemini is never called: generateText is mocked, so these check the prompt and the signature handling
const generateText = mock();
mock.module("ai", () => ({ generateText }));
mock.module("@ai-sdk/google", () => ({ google: (id: string) => ({ modelId: id }) }));

const { HELPDESK_URL, polishReply, signature } = await import("./polish-reply.ts");

const context = {
  subject: "Refund for my course",
  customerName: "Carla Customer",
  agentName: "Alan Agent",
  messages: [{ senderType: SenderType.CUSTOMER, fromName: "Carla Customer", body: "Can I get a refund?" }],
};
const sig = `Best regards,\nAlan Agent\n${HELPDESK_URL}`;

afterEach(() => {
  generateText.mockReset();
});

// What polishReply passed to generateText
function sentArgs() {
  const [args] = generateText.mock.calls[0] ?? [];
  return args as { system: string; prompt: string };
}

function sentPrompt() {
  return sentArgs().prompt;
}

describe("polishReply", () => {
  it("signs the polished reply with the agent's name and the helpdesk link", async () => {
    generateText.mockResolvedValue({ text: "  Hi Carla,\n\nYour refund has been processed.  " });

    const body = await polishReply("ur refund is done", context);

    expect(body).toBe(`Hi Carla,\n\nYour refund has been processed.\n\n${sig}`);
    expect(signature("Alan Agent")).toBe(sig);
    expect(HELPDESK_URL).toBe("https://helpdesk.com");
  });

  it("gives the model the customer's name and tells it to greet them by name and not sign", async () => {
    generateText.mockResolvedValue({ text: "Hi Carla, done." });

    await polishReply("done", context);

    const { system } = sentArgs();
    expect(sentPrompt()).toContain("Customer: Carla Customer");
    expect(sentPrompt()).toContain("<draft>\ndone\n</draft>");
    expect(system).toContain("addresses the customer by their first name");
    expect(system).toContain("leave out any closing");
  });

  it("drops the signature from a draft that was polished before, so it isn't added twice", async () => {
    generateText.mockResolvedValue({ text: "Hi Carla,\n\nYour refund is on its way." });

    const body = await polishReply(`Hi Carla,\n\nYour refund is done.\n\n${sig}\n`, context);

    expect(sentPrompt()).toContain("<draft>\nHi Carla,\n\nYour refund is done.\n</draft>");
    expect(body.match(/Best regards/g)).toHaveLength(1);
    expect(body.endsWith(sig)).toBe(true);
  });

  it("removes a signature the model copied anyway", async () => {
    generateText.mockResolvedValue({ text: `Hi Carla,\n\nDone.\n\n${sig}` });

    const body = await polishReply("done", context);

    expect(body).toBe(`Hi Carla,\n\nDone.\n\n${sig}`);
  });

  it("throws when the model answers with nothing", async () => {
    generateText.mockResolvedValue({ text: "   " });

    await expect(polishReply("done", context)).rejects.toThrow("Gemini returned an empty reply");
  });
});
