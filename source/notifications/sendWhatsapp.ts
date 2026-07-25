import { client } from "./twilioClient";

async function sendWhatsapp(to: string, contentSid: string, variables: object) {
    const message = await client.messages.create({
        contentSid: contentSid,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: "whatsapp:" + to,
        contentVariables: JSON.stringify(variables),
    });

    console.log(message.sid);
}

export { sendWhatsapp };