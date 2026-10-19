import { Router } from "express";
import { razorpayWebhookHandler } from "../controllers/billing.controller.js";
import { razorpayWebhookRateLimiter } from "../middleware/rateLimiter.js";

// UNAUTHENTICATED ROUTE, called by Razorpay. The compensating controls:
//   - X-Razorpay-Signature (HMAC of the raw body with
//     RAZORPAY_WEBHOOK_SECRET) is checked before anything is read; with no
//     secret configured every call is refused
//   - the state applied is Razorpay's own subscription entity, and only for
//     subscriptions this app created (matched by id)
//   - each event id is applied once (BillingEvent)
//   - rate limited
// Nothing here reads or returns clinic or patient data.
const router = Router();

router.post("/webhook", razorpayWebhookRateLimiter, razorpayWebhookHandler);

export default router;
