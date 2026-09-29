import { client } from "./twilioClient.js";

const services: string = process.env.TWILIO_VERIFY_SERVICE!

export const createVerification = async (to: string ) => {
  const verification = await client.verify.v2
    .services(services)
    .verifications.create({
      channel: "sms",
      to: to,
    });

  console.log(verification.status);
};

export const createVerificationCheck = async (to: string , code: string) => {
  const verificationCheck = await client.verify.v2
    .services(services)
    .verificationChecks.create({
      code: code,
      to: to,
    });

  console.log(verificationCheck.status);
}

