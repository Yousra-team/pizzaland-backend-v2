import {sendWhatsapp} from "../sendWhatsapp";


const CONTENT_SID = "";
const CONTENT_SID_FR =""

async function sendMagicLinkToken(params: {
    to: string;
    expiresIn: number;
    token: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID, {
        "1": params.expiresIn,
        "2": params.token,
    });
}

async function sendMagicLinkTokenFR(params: {
    to: string;
    expiresIn: number;
    token: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID_FR, {
        "1": params.expiresIn,
        "2": params.token,
    })
}
export { sendMagicLinkToken , sendMagicLinkTokenFR };