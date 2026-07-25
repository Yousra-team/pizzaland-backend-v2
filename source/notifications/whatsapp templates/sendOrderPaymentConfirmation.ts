import {sendWhatsapp} from "../sendWhatsapp";


const CONTENT_SID = "HX36d3c8463fcba28279ce63900f27d92f";

const CONTENT_SID_FR =""

async function sendOrderPaymentConfirmation(params: {
    to: string;
    customerName: string;
    orderNumber: string;
    amountPaid: number;
    paymentMethod: string;
    date: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID, {
        "1": params.customerName,
        "2": params.amountPaid,
        "3": params.orderNumber,
        "4": params.paymentMethod,
        "5": params.date,
    });
}

async function sendOrderPaymentConfirmationFR(params: {
    to: string;
    customerName: string;
    orderNumber: string;
    amountPaid: number;
    paymentMethod: string;
    date: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID_FR, {
        "1": params.customerName,
        "2": params.amountPaid,
        "3": params.orderNumber,
        "4": params.paymentMethod,
        "5": params.date,
    });
}


export { sendOrderPaymentConfirmation , sendOrderPaymentConfirmationFR };