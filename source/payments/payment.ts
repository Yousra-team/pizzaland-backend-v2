import axios from "axios";
import { Request, Response } from "express";
import { DateTime } from "luxon";
import * as z from "zod";
import { prisma } from "../lib/prisma.js";
import {
  paymentDetailsSchema,
  notifyPaymentSchema,
  methodSchema,
  paymentSchema,
} from "./paymentSchema.js";
import { CreateIdentifier } from "../utilities/counter.js";
import { sendOrderPaymentConfirmationFR } from "../notifications/whatsapp templates/sendOrderPaymentConfirmation.js";


// ─── Initiate Payment (Monetbil online flow) ─────────────────────────────────

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

    // Only successful payments count toward totalPaid.
    // A pending row from a prior abandoned attempt does NOT block a retry.
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

    if (totalPaid >= order.total) {
      res.status(400).json({ message: "This order has already been paid" });
      return;
    }

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

    // 2. Find the pending payment, pulling the order and its customer along with it
    const payment = await prisma.payments.findUnique({
      where: { id: data.payment_ref },
      include: {
        order: {
          include: {
            customer: true, // null if the order was placed as a guest
          },
        },
      },
    });

    // 3. Idempotency — only act on rows that are still pending.
    // If the row is gone or already finalized, there's nothing to do.
    if (!payment || payment.status !== "pending") {
      console.log("Payment already finalized or discarded:", data.payment_ref);
      res.status(200).send("Already processed");
      return;
    }

    // 4. Branch on Monetbil status
    if (data.status === "success") {
      // Guard: the webhook's amount must match what we recorded at initiation.
      // On mismatch, do not finalize — leave the row pending for investigation.
      if (data.amount !== payment.amount) {
        console.warn(
          `Payment ${data.payment_ref} amount mismatch — webhook: ${data.amount}, expected: ${payment.amount}`
        );
        res.status(200).send("Amount mismatch");
        return;
      }

      await prisma.payments.update({
        where: { id: data.payment_ref },
        data: { status: "paid" },
      });

      // Resolve recipient: prefer the linked customer, fall back to guest fields
      let recipientName: string;
      let recipientPhone: string;

      if (payment.order.customer) {
        recipientName = payment.order.customer.firstName;
        recipientPhone = payment.order.customer.phone;
      } else if (payment.order.guestName && payment.order.guestPhone) {
        recipientName = payment.order.guestName;
        recipientPhone = payment.order.guestPhone;
      } else {
        console.warn(
          `Payment ${data.payment_ref} paid, but order ${payment.orderNumber} has no customer or guest contact — skipping WhatsApp`
        );
        console.log(`Payment ${data.payment_ref} → paid`);
        res.status(200).send("OK");
        return;
      }

      const date = DateTime.now()
        .setZone("Africa/Douala")
        .setLocale("fr")
        .toFormat("dd/MM/yyyy 'à' HH:mm");

      // Fire-and-forget — a Twilio outage must NOT fail the webhook response
      sendOrderPaymentConfirmationFR({
        to: recipientPhone,
        customerName: recipientName,
        orderNumber: payment.orderNumber,
        amountPaid: String(payment.amount),
        paymentMethod: "Mobile Money",
        date,
      }).catch((err) => {
        console.error("WhatsApp confirmation failed:", err);
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

    // 5. Unknown status — leave the row alone so a later correct webhook can finalize it
    console.warn("Unknown Monetbil status:", data.status);
    res.status(200).send("Unknown status");
    return;

  } catch (error) {
    console.error("Monetbil webhook error:", error);
    // Always 200 so Monetbil doesn't keep retrying on our bug
    res.status(200).send("Error logged");
  }
};


// ─── Is My Order Paid ────────────────────────────────────────────────────────

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


// ─── Create Payment (cash / in-store, cashier-initiated) ─────────────────────

export const CreatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = paymentSchema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors = z.flattenError(result.error);
      res.status(400).json({ message: "Bad Request", error: fieldErrors.fieldErrors });
      return;
    }

    const data = result.data;

    // 1. Order must exist
    const order = await prisma.orders.findUnique({
      where: { number: data.orderNumber },
    });

    if (!order) {
      res.status(404).json({ message: "Order does not exist" });
      return;
    }

    // 2. Sum existing paid payments (pending Monetbil rows do not count here either)
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

    if (totalPaid >= order.total) {
      res.status(400).json({ message: "This order has already been paid" });
      return;
    }

    if (totalPaid + data.amount > order.total) {
      res.status(400).json({ message: "The amount you are trying to pay is too much" });
      return;
    }

    // 3. Build the payment identifier
    const Id = await CreateIdentifier("PAYMENT");

    if (!Id) {
      res.status(500).json({ message: "Could not create a payment Identifier" });
      return;
    }

    // 4. Record the payment — cashier has already confirmed receipt at the counter
    const newPayment = await prisma.payments.create({
      data: {
        id: Id,
        ...data,
        status: "paid",
      },
    });

    res.status(200).json(newPayment);

  } catch (error) {
    console.error("CreatePayment error:", error);
    res.status(500).json({ message: "An internal server error" });
  }
};

