import { describe, it, expect, vi } from "vitest";

const createMessage = vi.hoisted(() => vi.fn().mockResolvedValue({ sid: "SM123" }));
vi.mock("../../source/notifications/twilioClient.js", () => ({
    client: { messages: { create: createMessage } },
}));

import { sendWhatsapp } from "../../source/notifications/sendWhatsapp.js";

describe("sendWhatsapp", () => {
    it("adds the whatsapp: prefix and sends the variables as a JSON string", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});

        await sendWhatsapp("+237677123456", "HX1", { "1": "Awa", "2": "ORD-1" });

        expect(createMessage).toHaveBeenCalledWith({
            contentSid: "HX1",
            from: "whatsapp:+10000000000", // TWILIO_WHATSAPP_NUMBER from tests/setup.ts
            to: "whatsapp:+237677123456",
            contentVariables: '{"1":"Awa","2":"ORD-1"}',
        });
    });
});
