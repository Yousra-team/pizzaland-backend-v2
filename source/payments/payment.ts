import axios from "axios";
import { Request, Response } from "express";
import {prisma} from "../lib/prisma.js";
import * as z from "zod";
import { paymentDetailsSchema , notifyPaymentSchema, methodSchema, paymentSchema } from "./paymentSchema.js";
import { CreateIdentifier } from "../utilities/counter.js";

export const initiatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = paymentDetailsSchema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors = z.flattenError(result.error);
      res.status(400).json({ message: "Invalid Request", error: fieldErrors.fieldErrors });
      return;
    }

    const data = result.data;

    const order = await prisma.orders.findUnique({
      where: { number: data.orderNumber },
    });

    if (!order) {
      res.status(400).json({ message: "Order does not exist" });
      return;
    }

    const payments = await prisma.payments.findMany({
      where: { orderNumber: order.number },
    });

    // Sum previous payments with a plain loop
    let totalPaid = 0;
    for (const p of payments) {
      totalPaid = totalPaid + p.amount;
    }

    if (totalPaid >= order.total) {
      res.status(400).json({ message: "This order has already been paid" });
      return;
    }

    // Does this payment push us past the total?
    if (totalPaid + data.amount > order.total) {
      res.status(400).json({ message: "The amount you are trying to pay is too much" });
      return;
    }

    // Resolve the Monetbil operator to our internal payment method enum
   let method: z.infer<typeof methodSchema>;
    if (data.operator === "CM_ORANGEMONEY") {
      method = "ORANGE_MONEY_ONLINE";
    } else if (data.operator === "CM_MTNMOBILEMONEY") {
      method = "MOMO_ONLINE";
    } else {
      res.status(400).json({ message: "Unsupported operator" });
      return;
    }

    const paymentId = await CreateIdentifier("PAYMENT");

    if (!paymentId) {
      res.status(500).json({ message: "Unable to create a payment Identifier" });
      return;
    }

    // Call Monetbil API
    const response = await axios.post(
      `https://api.monetbil.com/widget/v2.1/${process.env.MONETBIL_SERVICE_KEY}`,
      {
        ...data,
        currency: "XAF",
        country: "CM",
        payment_ref: paymentId,
        notify_url: process.env.NOTIFY_URL,
        logo: process.env.LOGO,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    if (!response.data?.payment_url) {
      console.error("Unexpected Monetbil response:", response.data);
      res.status(500).json({ message: "Invalid payment gateway response" });
      return;
    }

    // Create the payment as PENDING — the webhook will finalize it
    await prisma.payments.create({
      data: {
        id: paymentId,
        orderNumber: order.number,
        amount: data.amount,
        method: method,
        provider: "MonetBil",
        status: "pending",
      },
    });

    res.status(200).json({ paymentUrl: response.data.payment_url });

  } catch (error) {
    console.error("Monetbil initiate payment error:", error);
    res.status(500).json({ message: "Payment gateway error" });
  }
};
// ─── Notify Payment (Monetbil webhook) ───────────────────────────────────────
export const notifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = notifyPaymentSchema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors = z.flattenError(result.error);
      res.status(400).json({ message: "Invalid Request", error: fieldErrors.fieldErrors });
      return;
    }

    const data = result.data;
    console.log("Monetbil webhook received:", req.body);

    // 1. Verify Monetbil service key
    if (data.service !== process.env.MONETBIL_SERVICE_KEY) {
      console.warn("Invalid service key attempt");
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    // 2. Find the pending payment created during initiation
    const payment = await prisma.payments.findUnique({
      where: { id: data.payment_ref },
    });

    // 3. Idempotency — don't re-process a finalized payment
      // Idempotency: only act on rows that are still pending.
    // If the row is gone, it was already finalized (either paid or deleted on failure).
    if (!payment || payment.status !== "pending") {
      console.log("Payment already finalized or discarded:", data.payment_ref);
      res.status(200).send("Already processed");
      return;
    }

    // Branch on Monetbil status
    if (data.status === "success") {
      await prisma.payments.update({
        where: { id: data.payment_ref },
        data: { status: "paid" },
      });
      console.log(`Payment ${data.payment_ref} → paid`);
      res.status(200).send("OK");
      return;
    }

    if (data.status === "failed" || data.status === "cancelled") {
      await prisma.payments.delete({
        where: { id: data.payment_ref },
      });
      console.log(`Payment ${data.payment_ref} discarded (${data.status})`);
      res.status(200).send("OK");
      return;
    }

    // Unknown status — leave the row alone so a later correct webhook can finalize it
    console.warn("Unknown Monetbil status:", data.status);
    res.status(200).send("Unknown status");
    return;

  } catch (error) {
    console.error("Monetbil webhook error:", error);
    // Always 200 so Monetbil doesn't keep retrying
    res.status(200).send("Error logged");
  }
};

export const isMyOrderPaid = async (req: Request, res: Response): Promise<void> => {
  try {
    const orderNumber = req.params.orderNumber as string;

    const order = await prisma.orders.findUnique({
      where: { number: orderNumber },
    });

    if (!order) {
      res.status(404).json({ message: "Order does not exist" });
      return;
    }

    const payments = await prisma.payments.findMany({
      where: {
        orderNumber: order.number,
        status: "paid",
      },
    });

    let totalPaid = 0;
    for (const p of payments) {
      totalPaid = totalPaid + p.amount;
    }

    const paid = totalPaid >= order.total;

    res.status(200).json({
      paid,
      totalPaid,
      total: order.total,
      remaining: order.total - totalPaid,
    });

  } catch (error) {
    console.error("isMyOrderPaid error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const CreatePayment = async (req: Request , res: Response): Promise<void> => {
  try {
      const result = paymentSchema.safeParse(req.body)
      if(!result.success) {
        const fieldErrors = z.flattenError(result.error)
        res.status(400).json({message: "Bad Request" , error:fieldErrors.fieldErrors})
        return
      }

      const data = result.data;
      
      const Id = await CreateIdentifier("PAYMENT")

      if(!Id) {
        res.status(500).json({message:" Could not create a payment Identifier"})
        return
      }


      const newPayment = await prisma.payments.create({
         data: {
          id: Id,
          ...data,
          status: "paid"
         }
      })
       res.status(200).json(newPayment)
  } catch (error) {
     res.status(500).json({message:"An internal server error"})
     console.log(error)
  }
};