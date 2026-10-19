import { env } from "../config/env.js";

// The ONLY place in this codebase that talks to Razorpay. A mutable object,
// like emailClient and whatsappClient, so tests can replace a method.
// Plain REST with Basic auth (key id : key secret) - no SDK.

const REQUEST_TIMEOUT_MS = 10000;

async function call(method, path, body) {
  const { keyId, keySecret, baseUrl } = env.billing.razorpay;
  if (!keyId || !keySecret) {
    const err = new Error(
      "Razorpay keys are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)",
    );
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // Razorpay explains a refusal in { error: { code, description } }.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(
      `Razorpay ${method} ${path} failed: ${data?.error?.description || `HTTP ${response.status}`}`,
    );
    err.status = response.status;
    err.razorpayError = data?.error;
    throw err;
  }
  return data;
}

export const razorpayClient = {
  createPlan(body) {
    return call("POST", "/plans", body);
  },
  createSubscription(body) {
    return call("POST", "/subscriptions", body);
  },
  fetchSubscription(id) {
    return call("GET", `/subscriptions/${encodeURIComponent(id)}`);
  },
  cancelSubscription(id, { atCycleEnd = false } = {}) {
    return call("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, {
      cancel_at_cycle_end: atCycleEnd,
    });
  },
};
