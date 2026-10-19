import { z } from "zod";
import { PLAN_CODES } from "../config/plans.js";

export const startSubscriptionSchema = z.object({
  plan: z.enum(PLAN_CODES, { errorMap: () => ({ message: "Choose a plan" }) }),
});

// What Razorpay's checkout hands the browser after the authorisation payment.
export const confirmCheckoutSchema = z.object({
  razorpay_payment_id: z.string().trim().min(1).max(64),
  razorpay_subscription_id: z.string().trim().min(1).max(64),
  razorpay_signature: z.string().trim().min(1).max(256),
});
