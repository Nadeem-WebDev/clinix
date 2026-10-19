import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  PLANS,
  PLAN_CODES,
  TRIAL_LIMITS,
  NO_LIMITS,
  limitsOf,
} from "../config/plans.js";
import { Clinic } from "../models/Clinic.js";
import {
  ClinicSubscription,
  RAZORPAY_STATUSES,
} from "../models/ClinicSubscription.js";
import { BillingEvent } from "../models/BillingEvent.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { razorpayClient } from "./razorpayClient.js";

// Clinic subscriptions (README "Subscriptions"). Razorpay holds the money
// side - plans, mandates, monthly charges, retries; this module keeps a copy
// of each subscription's state (ClinicSubscription), fed by the checkout
// callback and by webhooks, and turns it into what the app needs to know:
// is the clinic paid up, on which plan, and may it still add records.
//
// Nothing here runs unless BILLING_ENABLED is 'true' - with billing off
// every clinic is free and unlimited, exactly as before billing existed.

const DAY_MS = 24 * 60 * 60 * 1000;
// Monthly charges for ten years; a clinic cancels long before this runs out.
const TOTAL_CYCLES = 120;
const STAFF_ROLES = ["admin", "receptionist", "nurse"];
// A subscription that must stay on Razorpay's side until it has charged.
const LIVE_STATUSES = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
];

const toDate = (unix) => (unix ? new Date(unix * 1000) : null);

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function razorpayFailure(err) {
  console.error("[billing]", err.message);
  return new ApiError(
    502,
    "The payment service could not be reached. Please try again in a minute.",
    "RAZORPAY_ERROR",
  );
}

export function trialEndOf(clinic) {
  return clinic?.billing?.trialEndsAt
    ? new Date(clinic.billing.trialEndsAt)
    : new Date(
        new Date(clinic?.createdAt ?? Date.now()).getTime() +
          env.billing.trialDays * DAY_MS,
      );
}

function summarize(sub) {
  if (!sub) return null;
  return {
    id: sub.razorpaySubscriptionId,
    plan: sub.plan,
    status: sub.status,
    startAt: sub.startAt ?? null,
    currentEnd: sub.currentEnd ?? null,
    cancelAtCycleEnd: Boolean(sub.cancelAtCycleEnd),
  };
}

/**
 * What the clinic's subscription means right now. Pure: the clinic (for its
 * trial and any manual plan) and its subscriptions in, a state out.
 *
 *   status  free | trialing | active | cancelling | manual | past_due | expired
 *   access  full | grace (full, with a warning) | readonly
 *
 * readonly means nothing new can be added (see enforceBillingAccess in
 * middleware/authenticate.js); records stay readable and printable. A
 * clinic only gets there after graceDays of not being paid for - after a
 * failed charge, or after a trial or paid period ran out.
 */
export function resolveBilling(clinic, subscriptions, now = new Date()) {
  if (!env.billing.enabled) {
    return {
      enforced: false,
      status: "free",
      access: "full",
      plan: null,
      limits: NO_LIMITS,
    };
  }
  const graceMs = env.billing.graceDays * DAY_MS;
  const trialEndsAt = trialEndOf(clinic);
  // Newest first: when two could apply (a plan change), the newer wins.
  const subs = [...subscriptions]
    .filter((s) => s.status !== "created")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const scheduled = subs.find((s) => s.status === "authenticated");
  const base = {
    enforced: true,
    trialEndsAt,
    scheduled: summarize(scheduled),
    readOnlyFrom: null,
  };
  const paid = (status, plan, paidUntil, sub) => ({
    ...base,
    status,
    access: "full",
    plan,
    limits: limitsOf(plan),
    paidUntil: paidUntil ?? null,
    subscription: summarize(sub),
  });

  const { manualPlan, manualPaidUntil } = clinic?.billing ?? {};
  if (manualPaidUntil && new Date(manualPaidUntil) > now) {
    return paid(
      "manual",
      manualPlan || "multi",
      new Date(manualPaidUntil),
      null,
    );
  }

  // Razorpay keeps a subscription 'active' while it charges successfully -
  // and also through a cancel-at-month-end we asked for.
  const active = subs.find((s) => s.status === "active");
  if (active)
    return paid(
      active.cancelAtCycleEnd ? "cancelling" : "active",
      active.plan,
      active.currentEnd,
      active,
    );

  // A charge failed: Razorpay retries (pending), then gives up (halted).
  const failing = subs.find(
    (s) => s.status === "pending" || s.status === "halted",
  );
  if (failing) {
    const since = new Date(failing.failingSince ?? failing.updatedAt ?? now);
    const readOnlyFrom = new Date(since.getTime() + graceMs);
    return {
      ...base,
      status: "past_due",
      access: now < readOnlyFrom ? "grace" : "readonly",
      readOnlyFrom,
      plan: failing.plan,
      limits: limitsOf(failing.plan),
      paidUntil: failing.currentEnd ?? null,
      subscription: summarize(failing),
    };
  }

  // Cancelled, but the month already paid for hasn't run out.
  const stillPaid = subs.find(
    (s) =>
      ["cancelled", "completed", "paused"].includes(s.status) &&
      s.currentEnd &&
      new Date(s.currentEnd) > now,
  );
  if (stillPaid)
    return paid("cancelling", stillPaid.plan, stillPaid.currentEnd, stillPaid);

  if (trialEndsAt > now) {
    return {
      ...base,
      status: "trialing",
      access: "full",
      plan: null,
      limits: TRIAL_LIMITS,
      paidUntil: null,
      subscription: null,
    };
  }

  // Subscribed during the trial, which has just ended: Razorpay's first
  // charge is due now and its webhook will make the subscription active.
  if (scheduled) return paid("active", scheduled.plan, null, scheduled);

  // Nothing pays for today: a grace period from whenever paid time ended.
  const endings = [
    trialEndsAt,
    manualPaidUntil,
    ...subs.map((s) => s.currentEnd || s.endedAt),
  ]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  const readOnlyFrom = new Date(Math.max(...endings) + graceMs);
  const lastPlan =
    subs.find((s) => s.paidCount > 0 || s.currentEnd)?.plan ??
    manualPlan ??
    null;
  return {
    ...base,
    status: "expired",
    access: now < readOnlyFrom ? "grace" : "readonly",
    readOnlyFrom,
    plan: lastPlan,
    limits: lastPlan ? limitsOf(lastPlan) : TRIAL_LIMITS,
    paidUntil: null,
    subscription: null,
  };
}

export async function getBillingState(clinicId, { clinic } = {}) {
  if (!env.billing.enabled) return resolveBilling(null, []);
  const [c, subs] = await Promise.all([
    clinic ?? Clinic.findById(clinicId).select("createdAt billing").lean(),
    ClinicSubscription.find({ clinicId }).lean(),
  ]);
  return resolveBilling(c, subs);
}

async function usageOf(clinicId) {
  const [doctors, staff] = await Promise.all([
    User.countDocuments({ clinicId, active: true, role: "doctor" }),
    User.countDocuments({ clinicId, active: true, role: { $in: STAFF_ROLES } }),
  ]);
  return { doctors, staff };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Called before an account is created or switched back on. The owner never
// counts; every other role is either a doctor or staff.
export async function assertCanAddAccount(clinicId, role) {
  if (!env.billing.enabled || role === "owner") return;
  const [state, usage] = await Promise.all([
    getBillingState(clinicId),
    usageOf(clinicId),
  ]);
  const { maxDoctors, maxStaff } = state.limits;
  const what = state.plan ? `Your ${PLANS[state.plan].name} plan` : "The trial";
  if (role === "doctor" && maxDoctors != null && usage.doctors >= maxDoctors) {
    throw new ApiError(
      403,
      `${what} includes ${plural(maxDoctors, "doctor", "doctors")}. Upgrade your plan (Settings → Subscription) to add more.`,
      "PLAN_LIMIT",
    );
  }
  if (
    STAFF_ROLES.includes(role) &&
    maxStaff != null &&
    usage.staff >= maxStaff
  ) {
    throw new ApiError(
      403,
      `${what} includes ${plural(maxStaff, "staff account", "staff accounts")} besides doctors. Upgrade your plan (Settings → Subscription) to add more.`,
      "PLAN_LIMIT",
    );
  }
}

// WhatsApp and email notifications are a Clinic-plan-and-up feature, and
// stop when the clinic is read-only.
export async function messagingAllowed(clinicId) {
  if (!env.billing.enabled) return true;
  const state = await getBillingState(clinicId);
  return state.limits.messaging && state.access !== "readonly";
}

export async function assertMessagingAllowed(clinicId) {
  if (!(await messagingAllowed(clinicId))) {
    throw new ApiError(
      403,
      "WhatsApp and email notifications are part of the Clinic and Multi-doctor plans. Upgrade in Settings → Subscription.",
      "PLAN_LIMIT",
    );
  }
}

// What the app shows: the state, the plans to choose from, and how many
// accounts the clinic uses against its limits. Readable by all staff (the
// banner); only the owner can act on it.
export async function getBillingSummary(clinicId) {
  const [state, usage] = await Promise.all([
    getBillingState(clinicId),
    usageOf(clinicId),
  ]);
  return {
    ...state,
    usage,
    plans: PLAN_CODES.map((code) => ({
      ...PLANS[code],
      available: Boolean(env.billing.razorpay.plans[code]),
    })),
  };
}

// The first half of subscribing: create the Razorpay subscription the
// checkout pop-up then authorises. Charging starts when the clinic's current
// paid time ends (trial, manual plan, or the plan being replaced), so
// nobody pays twice for the same days; with nothing paid, it starts now.
export async function startSubscription(clinicId, planCode, requester) {
  if (!env.billing.enabled)
    throw ApiError.badRequest(
      "Subscriptions are not switched on yet",
      "BILLING_DISABLED",
    );
  const plan = PLANS[planCode];
  if (!plan) throw ApiError.badRequest("Choose a plan", "INVALID_PLAN");
  const razorpayPlanId = env.billing.razorpay.plans[planCode];
  if (!razorpayPlanId || !env.billing.razorpay.keyId) {
    throw new ApiError(
      503,
      "This plan is not available yet. Please contact Clinix support.",
      "PLAN_NOT_CONFIGURED",
    );
  }

  const clinic = await Clinic.findById(clinicId)
    .select("name createdAt billing")
    .lean();
  const [state, usage] = await Promise.all([
    getBillingState(clinicId, { clinic }),
    usageOf(clinicId),
  ]);
  if (state.status === "active" && state.plan === planCode) {
    throw ApiError.conflict(
      `You're already on the ${plan.name} plan.`,
      "ALREADY_SUBSCRIBED",
    );
  }
  if (state.scheduled?.plan === planCode) {
    throw ApiError.conflict(
      `The ${plan.name} plan is already set to start.`,
      "ALREADY_SUBSCRIBED",
    );
  }
  // A smaller plan only once the clinic fits in it - no account is ever
  // switched off behind the owner's back.
  if (plan.maxDoctors != null && usage.doctors > plan.maxDoctors) {
    throw ApiError.conflict(
      `You have ${plural(usage.doctors, "active doctor", "active doctors")}; the ${plan.name} plan includes ${plan.maxDoctors}. Switch off doctors on the Staff page first, or choose a bigger plan.`,
      "PLAN_TOO_SMALL",
    );
  }
  if (plan.maxStaff != null && usage.staff > plan.maxStaff) {
    throw ApiError.conflict(
      `You have ${plural(usage.staff, "active staff account", "active staff accounts")} besides doctors; the ${plan.name} plan includes ${plan.maxStaff}. Switch some off on the Staff page first, or choose a bigger plan.`,
      "PLAN_TOO_SMALL",
    );
  }

  const paidUntil =
    state.status === "trialing"
      ? state.trialEndsAt
      : ["active", "cancelling", "manual"].includes(state.status)
        ? state.paidUntil
        : null;
  // Razorpay needs a start time in the future; within minutes of it, just
  // start now.
  const startAt =
    paidUntil && new Date(paidUntil).getTime() > Date.now() + 10 * 60 * 1000
      ? new Date(paidUntil)
      : null;

  let created;
  try {
    created = await razorpayClient.createSubscription({
      plan_id: razorpayPlanId,
      total_count: TOTAL_CYCLES,
      quantity: 1,
      customer_notify: true,
      ...(startAt ? { start_at: Math.floor(startAt.getTime() / 1000) } : {}),
      notes: { clinicId: String(clinicId), plan: planCode },
    });
  } catch (err) {
    throw razorpayFailure(err);
  }

  await ClinicSubscription.create({
    clinicId,
    plan: planCode,
    razorpaySubscriptionId: created.id,
    status: RAZORPAY_STATUSES.includes(created.status)
      ? created.status
      : "created",
    startAt: toDate(created.start_at) ?? startAt,
    createdBy: requester._id,
  });

  return {
    subscriptionId: created.id,
    keyId: env.billing.razorpay.keyId,
    plan: planCode,
    startAt,
    clinicName: clinic.name,
    prefill: { name: requester.name, email: requester.email },
  };
}

// Copies a Razorpay subscription (from a webhook, the checkout callback or
// a fetch) onto our row. `seenAt` is when Razorpay reported it; anything
// older than what we already applied is ignored, as webhooks can arrive out
// of order. Returns the row, or null for a subscription we didn't create.
export async function applySubscriptionEntity(entity, seenAt = new Date()) {
  if (!entity?.id) return null;
  const sub = await ClinicSubscription.findOne({
    razorpaySubscriptionId: entity.id,
  });
  if (!sub) return null;
  if (sub.lastEventAt && seenAt < sub.lastEventAt) return sub;
  if (!RAZORPAY_STATUSES.includes(entity.status)) return sub;

  sub.status = entity.status;
  if (entity.start_at) sub.startAt = toDate(entity.start_at);
  if (entity.current_start) sub.currentStart = toDate(entity.current_start);
  if (entity.current_end) sub.currentEnd = toDate(entity.current_end);
  sub.chargeAt = toDate(entity.charge_at);
  if (entity.ended_at) sub.endedAt = toDate(entity.ended_at);
  if (typeof entity.paid_count === "number") sub.paidCount = entity.paid_count;
  if (sub.status === "pending" || sub.status === "halted") {
    sub.failingSince = sub.failingSince ?? seenAt;
  } else if (sub.status === "active") {
    sub.failingSince = undefined;
  }
  sub.lastEventAt = seenAt;
  await sub.save();

  if (sub.status === "authenticated" || sub.status === "active")
    await supersedeOlder(sub);
  return sub;
}

// A newer subscription is now authorised, so the older ones go: an active
// one at the end of its paid month (the new one starts then), anything
// else straight away. Unfinished checkouts were never charged and simply
// lapse at Razorpay, so they're only marked here.
async function supersedeOlder(sub) {
  const older = await ClinicSubscription.find({
    clinicId: sub.clinicId,
    _id: { $ne: sub._id },
    createdAt: { $lt: sub.createdAt },
    supersededAt: null,
    status: { $in: LIVE_STATUSES },
  });
  for (const old of older) {
    try {
      if (old.status !== "created") {
        const atCycleEnd = old.status === "active";
        await razorpayClient.cancelSubscription(old.razorpaySubscriptionId, {
          atCycleEnd,
        });
        if (atCycleEnd) old.cancelAtCycleEnd = true;
      }
      old.supersededAt = new Date();
      await old.save();
    } catch (err) {
      // Left for the next event to retry; logged so a stuck one is visible.
      console.error(
        `[billing] could not cancel replaced subscription ${old.razorpaySubscriptionId}: ${err.message}`,
      );
    }
  }
}

// The checkout pop-up's success callback. The signature proves Razorpay
// took the authorisation payment for OUR subscription id (not one the
// browser chose); the state itself is then fetched from Razorpay, never
// taken from the browser.
export async function confirmCheckout(
  clinicId,
  {
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: signature,
  },
) {
  const sub = await ClinicSubscription.findOne({
    clinicId,
    razorpaySubscriptionId: subscriptionId,
  });
  if (!sub) throw ApiError.notFound("Subscription not found");
  const expected = crypto
    .createHmac("sha256", env.billing.razorpay.keySecret ?? "")
    .update(`${paymentId}|${sub.razorpaySubscriptionId}`)
    .digest("hex");
  if (!env.billing.razorpay.keySecret || !safeEqual(expected, signature)) {
    throw ApiError.badRequest(
      "The payment could not be verified",
      "INVALID_SIGNATURE",
    );
  }

  try {
    await applySubscriptionEntity(
      await razorpayClient.fetchSubscription(sub.razorpaySubscriptionId),
      new Date(),
    );
  } catch (err) {
    // The signature already proves the authorisation went through; the
    // webhook will fill in the details.
    console.error(`[billing] fetch after checkout failed: ${err.message}`);
    if (sub.status === "created") {
      sub.status = "authenticated";
      await sub.save();
    }
  }
  return getBillingSummary(clinicId);
}

// Stop paying. A running subscription keeps full access to the end of the
// month already paid for; one not yet charged (set to start after the
// trial or after the current plan) is cancelled outright.
export async function cancelSubscription(clinicId) {
  if (!env.billing.enabled)
    throw ApiError.badRequest(
      "Subscriptions are not switched on yet",
      "BILLING_DISABLED",
    );
  const subs = await ClinicSubscription.find({
    clinicId,
    status: { $in: ["authenticated", "active", "pending", "halted"] },
    cancelAtCycleEnd: false,
  });
  if (subs.length === 0)
    throw ApiError.badRequest(
      "There is no subscription to cancel",
      "NOTHING_TO_CANCEL",
    );

  for (const sub of subs) {
    const atCycleEnd = sub.status === "active";
    let entity;
    try {
      entity = await razorpayClient.cancelSubscription(
        sub.razorpaySubscriptionId,
        { atCycleEnd },
      );
    } catch (err) {
      throw razorpayFailure(err);
    }
    sub.cancelAtCycleEnd = atCycleEnd;
    await sub.save();
    await applySubscriptionEntity(entity, new Date());
  }
  return getBillingSummary(clinicId);
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = env.billing.razorpay.webhookSecret;
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return safeEqual(expected, signature);
}

// One verified Razorpay webhook. Duplicates (same event id) are dropped;
// events for subscriptions we didn't create are acknowledged and ignored.
export async function handleWebhookEvent(event, eventId) {
  if (!event?.event?.startsWith("subscription.")) return { ignored: true };
  if (eventId && (await BillingEvent.exists({ eventId })))
    return { duplicate: true };

  const entity = event.payload?.subscription?.entity;
  const seenAt = event.created_at
    ? new Date(event.created_at * 1000)
    : new Date();
  const sub = await applySubscriptionEntity(entity, seenAt);

  if (eventId) {
    await BillingEvent.create({
      eventId,
      event: event.event,
      razorpaySubscriptionId: entity?.id,
      clinicId: sub?.clinicId,
    }).catch((err) => {
      // A concurrent duplicate delivery got there first - already applied.
      if (err.code !== 11000) throw err;
    });
  }
  return { applied: Boolean(sub) };
}

// --- Platform admin --------------------------------------------------------

// Extend a trial, or put a clinic on a plan without Razorpay (bank transfer,
// a free plan). null clears a field.
export async function updateBillingOverride(
  clinicId,
  { trialEndsAt, manualPlan, manualPaidUntil, manualNote },
) {
  const clinic = await Clinic.findById(clinicId);
  if (!clinic) throw ApiError.notFound("Clinic not found");
  if (!clinic.billing) clinic.billing = {};
  if (trialEndsAt !== undefined)
    clinic.billing.trialEndsAt = trialEndsAt ?? undefined;
  if (manualPlan !== undefined)
    clinic.billing.manualPlan = manualPlan ?? undefined;
  if (manualPaidUntil !== undefined)
    clinic.billing.manualPaidUntil = manualPaidUntil ?? undefined;
  if (manualNote !== undefined)
    clinic.billing.manualNote = manualNote || undefined;
  await clinic.save();
  return clinic;
}

export async function getPlatformBillingView(clinicId) {
  const [summary, subscriptions] = await Promise.all([
    getBillingSummary(clinicId),
    ClinicSubscription.find({ clinicId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);
  return {
    ...summary,
    subscriptions: subscriptions.map((s) => ({
      ...summarize(s),
      paidCount: s.paidCount,
      failingSince: s.failingSince ?? null,
      createdAt: s.createdAt,
    })),
  };
}
