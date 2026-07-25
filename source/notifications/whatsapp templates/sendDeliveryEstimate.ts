import {sendWhatsapp} from "../sendWhatsapp";


const CONTENT_SID = "HX7c3b2d691d8d9a3a3d26a9957cea110b";
const CONTENT_SID_FR=""

async function sendDeliveryEstimate(params: {
    to: string;
    customerName: string;
    orderNumber: string;
    deliveryTime: string;
    deliveryAgent: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID, {
        "1": params.customerName,
        "2": params.orderNumber,
        "3": params.deliveryTime,
        "4": params.deliveryAgent,
    });
}

async function sendDeliveryEstimateFR(params: {
    to: string;
    customerName: string;
    orderNumber: string;
    deliveryTime: string;
    deliveryAgent: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID_FR, {
        "1": params.customerName,
        "2": params.orderNumber,
        "3": params.deliveryTime,
        "4": params.deliveryAgent,
    });
}


export { sendDeliveryEstimate , sendDeliveryEstimateFR };