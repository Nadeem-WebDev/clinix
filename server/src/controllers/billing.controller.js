import * as billingService from "../services/billing.service.js";
import { sendSuccess } from "../utils/ApiResponse.js";
import { writeAuditLog } from "../utils/audit.js";
import { ApiError } from "../utils/ApiError.js";

function audit(req, action, metadata) {
  return writeAuditLog({
    clinicId: req.clinicId,
    userId: req.user._id,
    action,
    resourceType: "Subscription",
    metadata,
    ipAddress: req.ip,
  });
}

export async function getBillingHandler(req, res, next) {
  try {
    return sendSuccess(res, {
      data: { billing: await billingService.getBillingSummary(req.clinicId) },
    });
  } catch (err) {
    return next(err);
  }
}

export async function startSubscriptionHandler(req, res, next) {
  try {
    const checkout = await billingService.startSubscription(
      req.clinicId,
      req.body.plan,
      req.user,
    );
    await audit(req, "SUBSCRIPTION_STARTED", {
      plan: checkout.plan,
      subscriptionId: checkout.subscriptionId,
    });
    return sendSuccess(res, {
      status: 201,
      message: "Subscription created",
      data: { checkout },
    });
  } catch (err) {
    return next(err);
  }
}

export async function confirmCheckoutHandler(req, res, next) {
  try {
    const billing = await billingService.confirmCheckout(
      req.clinicId,
      req.body,
    );
    await audit(req, "SUBSCRIPTION_AUTHORISED", {
      subscriptionId: req.body.razorpay_subscription_id,
    });
    return sendSuccess(res, {
      message: "Subscription confirmed",
      data: { billing },
    });
  } catch (err) {
    return next(err);
  }
}

export async function cancelSubscriptionHandler(req, res, next) {
  try {
    const billing = await billingService.cancelSubscription(req.clinicId);
    await audit(req, "SUBSCRIPTION_CANCELLED");
    return sendSuccess(res, {
      message: "Subscription cancelled",
      data: { billing },
    });
  } catch (err) {
    return next(err);
  }
}

// Called by Razorpay, not a browser. A bad signature is refused before the
// body is looked at; anything verified is acknowledged with 200, even an
// event we ignore, so Razorpay doesn't keep retrying it.
export async function razorpayWebhookHandler(req, res, next) {
  try {
    if (
      !billingService.verifyWebhookSignature(
        req.rawBody,
        req.get("x-razorpay-signature"),
      )
    ) {
      throw new ApiError(400, "Invalid signature", "INVALID_SIGNATURE");
    }
    const result = await billingService.handleWebhookEvent(
      req.body,
      req.get("x-razorpay-event-id"),
    );
    return sendSuccess(res, { data: result });
  } catch (err) {
    return next(err);
  }
}
