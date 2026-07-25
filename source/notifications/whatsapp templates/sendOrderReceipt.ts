import { sendWhatsapp } from "../sendWhatsapp";

const CONTENT_SID = "HXe1bd24f3d76e428c1f149d523ff0e4cc";
const CONTENT_SID_FR = "HXe1bd24f3d76e428c1f149d523ff0e4cc";

async function sendOrderReceipt(params: {
    to: string;
    customerName: string;
    orderNumber: string;
    date: string;
    itemsList: string;
    subtotal: string;
    discount: number;
    deliveryFee: string;
    total: string;
    address: string;
    paymentMethod: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID, {
        "1": params.customerName,
        "2": params.orderNumber,
        "3": params.date,
        "4": params.itemsList,
        "5": params.subtotal,
        "6": params.discount,
        "7": params.deliveryFee,
        "8": params.total,
        "9": params.address,
        "10": params.paymentMethod,
    });
}

async function sendOrderReceiptFR(params: {
    to: string;
    customerName: string;
    orderNumber: string;
    date: string;
    itemsList: string;
    subtotal: string;
    discount: number;
    deliveryFee: string;
    total: string;
    address: string;
    paymentMethod: string;
}) {
    await sendWhatsapp(params.to, CONTENT_SID_FR, {
        "1": params.customerName,
        "2": params.orderNumber,
        "3": params.date,
        "4": params.itemsList,
        "5": params.subtotal,
        "6": params.discount,
        "7": params.deliveryFee,
        "8": params.total,
        "9": params.address,
        "10": params.paymentMethod,
    });
}

export { sendOrderReceipt , sendOrderReceiptFR };