import {sendWhatsapp} from "../sendWhatsapp.js";


const CONTENT_SID = "HXca3363d04e6fe4272545af6a07e697d0";
const CONTENT_SID_FR ="HXbb50217128fb6dfbc2f57d5ff62dceac"

async function sendMagicLinkToken(params: {
    to: string;
    expiresIn: string; //testing
    token: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID, {
        "1": params.expiresIn,
        "2": params.token,
    });
}

async function sendMagicLinkTokenFR(params: {
    to: string;
    expiresIn: string; // testing if should be a string
    token: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID_FR, {
        "1": params.expiresIn,
        "2": params.token,
    })
}
export { sendMagicLinkToken , sendMagicLinkTokenFR };