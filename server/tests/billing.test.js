import crypto from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./testDb.js";
import { registerClinicAgent, createStaffAgent } from "./helpers.js";
import { env } from "../src/config/env.js";
import { TRIAL_LIMITS, NO_LIMITS } from "../src/config/plans.js";
import { Clinic } from "../src/models/Clinic.js";
import { ClinicSubscription } from "../src/models/ClinicSubscription.js";
import { PlatformAdmin } from "../src/models/PlatformAdmin.js";
import { razorpayClient } from "../src/services/razorpayClient.js";
import {
  resolveBilling,
  messagingAllowed,
} from "../src/services/billing.service.js";

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;
const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

const originalBilling = structuredClone(env.billing);
const originalClient = { ...razorpayClient };

// Razorpay as a fake: records calls, and keeps the subscriptions it
// "created" so fetch/cancel answer like the real API.
let calls;
let remote;
function fakeRazorpay() {
  calls = [];
  remote = new Map();
  let n = 0;
  Object.assign(razorpayClient, {
    async createSubscription(body) {
      calls.push(["create", body]);
      n += 1;
      const sub = {
        id: `sub_test${n}`,
        status: "created",
        plan_id: body.plan_id,
        start_at: body.start_at ?? null,
        notes: body.notes,
      };
      remote.set(sub.id, sub);
      return sub;
    },
    async fetchSubscription(id) {
      calls.push(["fetch", id]);
      return remote.get(id);
    },
    async cancelSubscription(id, { atCycleEnd = false } = {}) {
      calls.push(["cancel", id, atCycleEnd]);
      const sub = remote.get(id) ?? { id };
      if (!atCycleEnd) sub.status = "cancelled";
      return sub;
    },
  });
}

beforeAll(async () => {
  await connectTestDB();
});

beforeEach(() => {
  Object.assign(env.billing, structuredClone(originalBilling), {
    enabled: true,
    razorpay: {
      ...originalBilling.razorpay,
      keyId: "rzp_test_key",
      keySecret: KEY_SECRET,
      webhookSecret: WEBHOOK_SECRET,
      plans: {
        starter: "plan_starter",
        clinic: "plan_clinic",
        multi: "plan_multi",
      },
    },
  });
  fakeRazorpay();
});

afterEach(async () => {
  Object.assign(env.billing, structuredClone(originalBilling));
  Object.assign(razorpayClient, originalClient);
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

async function setup() {
  const { agent: ownerAgent, clinic } = await registerClinicAgent(app);
  const { agent: receptionistAgent } = await createStaffAgent(
    app,
    ownerAgent,
    "receptionist",
  );
  return { ownerAgent, receptionistAgent, clinicId: clinic._id };
}

const endTrial = (clinicId, daysAgo = 1) =>
  Clinic.updateOne(
    { _id: clinicId },
    { "billing.trialEndsAt": new Date(Date.now() - daysAgo * DAY) },
  );

const unix = (date) => Math.floor(date.getTime() / 1000);

function webhook(
  event,
  subscription,
  {
    eventId = crypto.randomUUID(),
    createdAt = new Date(),
    secret = WEBHOOK_SECRET,
  } = {},
) {
  // Razorpay's own record moves with the events it sends.
  if (remote.has(subscription.id))
    Object.assign(remote.get(subscription.id), subscription);
  const body = JSON.stringify({
    entity: "event",
    event,
    contains: ["subscription"],
    payload: { subscription: { entity: subscription } },
    created_at: unix(createdAt),
  });
  return request(app)
    .post("/api/v1/razorpay/webhook")
    .set("Content-Type", "application/json")
    .set(
      "X-Razorpay-Signature",
      crypto.createHmac("sha256", secret).update(body).digest("hex"),
    )
    .set("X-Razorpay-Event-Id", eventId)
    .send(body);
}

// A clinic paying monthly on `plan`: subscribe, then Razorpay activates it.
async function activeOn(
  ownerAgent,
  plan,
  { periodEnd = new Date(Date.now() + 20 * DAY) } = {},
) {
  const res = await ownerAgent.post("/api/v1/billing/subscribe").send({ plan });
  expect(res.status).toBe(201);
  const id = res.body.data.checkout.subscriptionId;
  await webhook("subscription.activated", {
    id,
    status: "active",
    current_start: unix(new Date(periodEnd.getTime() - 30 * DAY)),
    current_end: unix(periodEnd),
    paid_count: 1,
  });
  return id;
}

const billingOf = async (agent) =>
  (await agent.get("/api/v1/billing")).body.data.billing;

describe("resolveBilling", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const clinic = (billing = {}) => ({
    createdAt: new Date("2026-10-01T00:00:00Z"),
    billing,
  });
  const sub = (fields) => ({
    plan: "clinic",
    createdAt: new Date("2026-10-05T00:00:00Z"),
    paidCount: 1,
    ...fields,
  });

  it("is free and unlimited with billing switched off", () => {
    env.billing.enabled = false;
    expect(resolveBilling(clinic(), [], now)).toMatchObject({
      enforced: false,
      status: "free",
      access: "full",
      limits: NO_LIMITS,
    });
  });

  it("trials for 14 days from sign-up when no end date was stored", () => {
    const state = resolveBilling(
      { createdAt: new Date("2026-10-10T00:00:00Z") },
      [],
      now,
    );
    expect(state).toMatchObject({
      status: "trialing",
      access: "full",
      limits: TRIAL_LIMITS,
    });
    expect(state.trialEndsAt).toEqual(new Date("2026-10-24T00:00:00Z"));
  });

  it("gives 7 days of grace after the trial, then turns read-only", () => {
    const graced = resolveBilling(
      clinic({ trialEndsAt: new Date("2026-10-15T10:00:00Z") }),
      [],
      now,
    );
    expect(graced).toMatchObject({
      status: "expired",
      access: "grace",
      readOnlyFrom: new Date("2026-10-22T10:00:00Z"),
    });
    const lapsed = resolveBilling(
      clinic({ trialEndsAt: new Date("2026-10-10T10:00:00Z") }),
      [],
      now,
    );
    expect(lapsed).toMatchObject({ status: "expired", access: "readonly" });
  });

  it("is active on the plan being paid, and cancelling until the paid month ends", () => {
    const end = new Date("2026-11-05T00:00:00Z");
    expect(
      resolveBilling(
        clinic(),
        [sub({ status: "active", currentEnd: end })],
        now,
      ),
    ).toMatchObject({
      status: "active",
      plan: "clinic",
      paidUntil: end,
      limits: { maxDoctors: 3, messaging: true },
    });
    expect(
      resolveBilling(
        clinic(),
        [sub({ status: "active", currentEnd: end, cancelAtCycleEnd: true })],
        now,
      ).status,
    ).toBe("cancelling");
    expect(
      resolveBilling(
        clinic(),
        [sub({ status: "cancelled", currentEnd: end })],
        now,
      ),
    ).toMatchObject({ status: "cancelling", access: "full" });
  });

  it("counts the grace period from the first failed charge", () => {
    const failing = (days) => [
      sub({
        status: "halted",
        failingSince: new Date(now.getTime() - days * DAY),
      }),
    ];
    expect(resolveBilling(clinic(), failing(3), now)).toMatchObject({
      status: "past_due",
      access: "grace",
    });
    expect(resolveBilling(clinic(), failing(8), now)).toMatchObject({
      status: "past_due",
      access: "readonly",
    });
  });

  it("ignores an unfinished checkout, and prefers a manual plan", () => {
    expect(
      resolveBilling(
        clinic({ trialEndsAt: new Date("2026-10-30T00:00:00Z") }),
        [sub({ status: "created" })],
        now,
      ).status,
    ).toBe("trialing");
    const manual = resolveBilling(
      clinic({
        manualPlan: "starter",
        manualPaidUntil: new Date("2026-12-01T00:00:00Z"),
      }),
      [],
      now,
    );
    expect(manual).toMatchObject({
      status: "manual",
      plan: "starter",
      access: "full",
      limits: { maxDoctors: 1, maxStaff: 2 },
    });
  });

  it("treats a subscription taken during the trial as active once the trial is over", () => {
    const state = resolveBilling(
      clinic({ trialEndsAt: new Date("2026-10-19T00:00:00Z") }),
      [sub({ status: "authenticated", paidCount: 0 })],
      now,
    );
    expect(state).toMatchObject({
      status: "active",
      plan: "clinic",
      access: "full",
    });
  });
});

describe("trial and summary", () => {
  it("starts every new clinic on a 14-day trial, visible to all staff", async () => {
    const { receptionistAgent, clinicId } = await setup();
    const trialEndsAt = (await Clinic.findById(clinicId)).billing.trialEndsAt;
    expect(trialEndsAt.getTime()).toBeGreaterThan(Date.now() + 13.9 * DAY);
    expect(trialEndsAt.getTime()).toBeLessThan(Date.now() + 14.1 * DAY);

    const billing = await billingOf(receptionistAgent);
    expect(billing).toMatchObject({
      status: "trialing",
      access: "full",
      usage: { doctors: 0, staff: 1 },
    });
    expect(
      billing.plans.map((p) => [p.code, p.pricePaise, p.available]),
    ).toEqual([
      ["starter", 49900, true],
      ["clinic", 99900, true],
      ["multi", 199900, true],
    ]);
  });
});

describe("subscribing", () => {
  it("during the trial, starts charging when the trial ends", async () => {
    const { ownerAgent, clinicId } = await setup();
    const res = await ownerAgent
      .post("/api/v1/billing/subscribe")
      .send({ plan: "clinic" });

    expect(res.status).toBe(201);
    const trialEndsAt = (await Clinic.findById(clinicId)).billing.trialEndsAt;
    expect(calls[0]).toEqual([
      "create",
      {
        plan_id: "plan_clinic",
        total_count: 120,
        quantity: 1,
        customer_notify: true,
        start_at: unix(trialEndsAt),
        notes: { clinicId: String(clinicId), plan: "clinic" },
      },
    ]);
    expect(res.body.data.checkout).toMatchObject({
      subscriptionId: "sub_test1",
      keyId: "rzp_test_key",
      plan: "clinic",
    });
    expect(
      await ClinicSubscription.findOne({ razorpaySubscriptionId: "sub_test1" }),
    ).toMatchObject({ status: "created", plan: "clinic" });
  });

  it("after the trial, starts charging straight away", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await ownerAgent
      .post("/api/v1/billing/subscribe")
      .send({ plan: "starter" });
    expect(calls[0][1]).not.toHaveProperty("start_at");
  });

  it("is for the owner only, and refused with billing switched off", async () => {
    const { ownerAgent, receptionistAgent } = await setup();
    expect(
      (
        await receptionistAgent
          .post("/api/v1/billing/subscribe")
          .send({ plan: "clinic" })
      ).status,
    ).toBe(403);
    env.billing.enabled = false;
    expect(
      (
        await ownerAgent
          .post("/api/v1/billing/subscribe")
          .send({ plan: "clinic" })
      ).body.code,
    ).toBe("BILLING_DISABLED");
  });

  it("refuses a plan the clinic has outgrown", async () => {
    const { ownerAgent } = await setup();
    await createStaffAgent(app, ownerAgent, "doctor");
    await createStaffAgent(app, ownerAgent, "doctor");

    const res = await ownerAgent
      .post("/api/v1/billing/subscribe")
      .send({ plan: "starter" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PLAN_TOO_SMALL");
    expect(res.body.message).toMatch(
      /You have 2 active doctors; the Starter plan includes 1/,
    );
    expect(calls).toHaveLength(0);
  });

  it("says so when a plan has no Razorpay plan id yet", async () => {
    const { ownerAgent } = await setup();
    env.billing.razorpay.plans.multi = undefined;
    const res = await ownerAgent
      .post("/api/v1/billing/subscribe")
      .send({ plan: "multi" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("PLAN_NOT_CONFIGURED");
  });
});

describe("checkout confirmation", () => {
  const sign = (paymentId, subId, secret = KEY_SECRET) =>
    crypto
      .createHmac("sha256", secret)
      .update(`${paymentId}|${subId}`)
      .digest("hex");

  it("accepts Razorpay's signature and takes the state from Razorpay, not the browser", async () => {
    const { ownerAgent } = await setup();
    await ownerAgent.post("/api/v1/billing/subscribe").send({ plan: "clinic" });
    remote.get("sub_test1").status = "authenticated";

    const res = await ownerAgent.post("/api/v1/billing/confirm").send({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_test1",
      razorpay_signature: sign("pay_1", "sub_test1"),
    });

    expect(res.status).toBe(200);
    expect(calls).toContainEqual(["fetch", "sub_test1"]);
    expect(res.body.data.billing).toMatchObject({
      status: "trialing",
      scheduled: { plan: "clinic", status: "authenticated" },
    });
  });

  it("refuses a forged signature", async () => {
    const { ownerAgent } = await setup();
    await ownerAgent.post("/api/v1/billing/subscribe").send({ plan: "clinic" });
    const res = await ownerAgent.post("/api/v1/billing/confirm").send({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_test1",
      razorpay_signature: sign("pay_1", "sub_test1", "wrong"),
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_SIGNATURE");
  });

  it("can't confirm another clinic's subscription", async () => {
    const { ownerAgent } = await setup();
    await ownerAgent.post("/api/v1/billing/subscribe").send({ plan: "clinic" });
    const { agent: otherOwner } = await registerClinicAgent(app);
    const res = await otherOwner.post("/api/v1/billing/confirm").send({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_test1",
      razorpay_signature: sign("pay_1", "sub_test1"),
    });
    expect(res.status).toBe(404);
  });
});

describe("webhooks", () => {
  it("activates the subscription", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await activeOn(ownerAgent, "clinic");
    expect(await billingOf(ownerAgent)).toMatchObject({
      status: "active",
      plan: "clinic",
      access: "full",
    });
  });

  it("refuses a bad signature, or any webhook without a configured secret", async () => {
    const { ownerAgent } = await setup();
    await ownerAgent.post("/api/v1/billing/subscribe").send({ plan: "clinic" });
    expect(
      (
        await webhook(
          "subscription.activated",
          { id: "sub_test1", status: "active" },
          { secret: "nope" },
        )
      ).status,
    ).toBe(400);
    env.billing.razorpay.webhookSecret = undefined;
    expect(
      (
        await webhook("subscription.activated", {
          id: "sub_test1",
          status: "active",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ClinicSubscription.findOne({
          razorpaySubscriptionId: "sub_test1",
        })
      ).status,
    ).toBe("created");
  });

  it("applies each event once, and never moves backwards on a late older event", async () => {
    const { ownerAgent } = await setup();
    await ownerAgent.post("/api/v1/billing/subscribe").send({ plan: "clinic" });
    const t = Date.now();

    await webhook(
      "subscription.charged",
      { id: "sub_test1", status: "active", paid_count: 2 },
      { eventId: "evt_2", createdAt: new Date(t) },
    );
    const repeat = await webhook(
      "subscription.charged",
      { id: "sub_test1", status: "active" },
      { eventId: "evt_2", createdAt: new Date(t) },
    );
    expect(repeat.body.data).toEqual({ duplicate: true });
    await webhook(
      "subscription.pending",
      { id: "sub_test1", status: "pending" },
      { eventId: "evt_1", createdAt: new Date(t - 60000) },
    );

    expect(
      await ClinicSubscription.findOne({ razorpaySubscriptionId: "sub_test1" }),
    ).toMatchObject({ status: "active", paidCount: 2 });
  });

  it("acknowledges events for subscriptions it never created", async () => {
    await setup();
    const res = await webhook("subscription.activated", {
      id: "sub_elsewhere",
      status: "active",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ applied: false });
  });
});

describe("failed payments and read-only", () => {
  async function pastDue(ownerAgent, failedDaysAgo) {
    const id = await activeOn(ownerAgent, "clinic");
    await webhook("subscription.halted", { id, status: "halted" });
    await ClinicSubscription.updateOne(
      { razorpaySubscriptionId: id },
      { failingSince: new Date(Date.now() - failedDaysAgo * DAY) },
    );
  }

  it("keeps full access for 7 days after a failed charge", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await pastDue(ownerAgent, 2);
    expect(await billingOf(ownerAgent)).toMatchObject({
      status: "past_due",
      access: "grace",
    });
    const created = await ownerAgent
      .post("/api/v1/patients")
      .send({
        fullName: "Asha Rao",
        age: 30,
        gender: "female",
        phone: "9876500001",
      });
    expect(created.status).toBe(201);
  });

  it("then turns read-only: everything readable, nothing new, paying still possible", async () => {
    const { ownerAgent, receptionistAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await pastDue(ownerAgent, 8);

    const blocked = await receptionistAgent
      .post("/api/v1/patients")
      .send({
        fullName: "Asha Rao",
        age: 30,
        gender: "female",
        phone: "9876500001",
      });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe("SUBSCRIPTION_INACTIVE");
    expect(blocked.body.message).toMatch(/ask the clinic owner to renew/);
    expect((await receptionistAgent.get("/api/v1/patients")).status).toBe(200);

    // Paying, signing out and switching staff OFF still work.
    expect(
      (
        await ownerAgent
          .post("/api/v1/billing/subscribe")
          .send({ plan: "clinic" })
      ).status,
    ).toBe(201);
    const staff = (await ownerAgent.get("/api/v1/users")).body.data.staff;
    const receptionist = staff.find((u) => u.role === "receptionist");
    expect(
      (
        await ownerAgent
          .patch(`/api/v1/users/${receptionist._id}/active`)
          .send({ active: false })
      ).status,
    ).toBe(200);
    expect(
      (
        await ownerAgent
          .patch(`/api/v1/users/${receptionist._id}/active`)
          .send({ active: true })
      ).status,
    ).toBe(402);
    expect((await ownerAgent.post("/api/v1/auth/logout")).status).toBe(200);
  });

  it("comes back once a charge succeeds", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await pastDue(ownerAgent, 8);
    await webhook("subscription.activated", {
      id: "sub_test1",
      status: "active",
      current_end: unix(new Date(Date.now() + 30 * DAY)),
    });

    expect(await billingOf(ownerAgent)).toMatchObject({
      status: "active",
      access: "full",
    });
    expect(
      (
        await ClinicSubscription.findOne({
          razorpaySubscriptionId: "sub_test1",
        })
      ).failingSince,
    ).toBeUndefined();
  });
});

describe("plan limits", () => {
  it("stops a Starter clinic adding a second doctor or a third staff account", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await activeOn(ownerAgent, "starter");
    await createStaffAgent(app, ownerAgent, "doctor");

    const doctor = await ownerAgent
      .post("/api/v1/users")
      .send({
        name: "Second Doc",
        email: "doc2@test.local",
        password: "supersecret123",
        role: "doctor",
      });
    expect(doctor.status).toBe(403);
    expect(doctor.body.message).toBe(
      "Your Starter plan includes 1 doctor. Upgrade your plan (Settings → Subscription) to add more.",
    );

    await createStaffAgent(app, ownerAgent, "nurse");
    const third = await ownerAgent
      .post("/api/v1/users")
      .send({
        name: "Third",
        email: "third@test.local",
        password: "supersecret123",
        role: "receptionist",
      });
    expect(third.status).toBe(403);
    expect(third.body.code).toBe("PLAN_LIMIT");
  });

  it("won't switch an account back on over the limit", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await createStaffAgent(app, ownerAgent, "doctor", {
      email: "d1@test.local",
    });
    const staff = (await ownerAgent.get("/api/v1/users")).body.data.staff;
    const doctor = staff.find((u) => u.email === "d1@test.local");
    await ownerAgent
      .patch(`/api/v1/users/${doctor._id}/active`)
      .send({ active: false });
    await activeOn(ownerAgent, "starter");
    await createStaffAgent(app, ownerAgent, "doctor", {
      email: "d2@test.local",
    });

    const res = await ownerAgent
      .patch(`/api/v1/users/${doctor._id}/active`)
      .send({ active: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLAN_LIMIT");
  });

  it("keeps WhatsApp and email notifications for the Clinic plan and up", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    await activeOn(ownerAgent, "starter");

    const res = await ownerAgent
      .patch("/api/v1/clinics/settings")
      .send({ whatsappEnabled: true });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(
      /part of the Clinic and Multi-doctor plans/,
    );
    expect(await messagingAllowed(clinicId)).toBe(false);
    // Turning them off is always fine.
    expect(
      (
        await ownerAgent
          .patch("/api/v1/clinics/settings")
          .send({ emailEnabled: false })
      ).status,
    ).toBe(200);
  });

  it("has no limits with billing switched off", async () => {
    const { ownerAgent, clinicId } = await setup();
    env.billing.enabled = false;
    await createStaffAgent(app, ownerAgent, "doctor");
    for (let i = 0; i < 6; i += 1) {
      const res = await ownerAgent
        .post("/api/v1/users")
        .send({
          name: `Doc ${i}`,
          email: `doc${i}@test.local`,
          password: "supersecret123",
          role: "doctor",
        });
      expect(res.status).toBe(201);
    }
    expect(await messagingAllowed(clinicId)).toBe(true);
  });
});

describe("changing plan and cancelling", () => {
  it("starts the new plan when the paid month ends, and cancels the old one then", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId);
    const periodEnd = new Date(Date.now() + 20 * DAY);
    const oldId = await activeOn(ownerAgent, "clinic", { periodEnd });

    const res = await ownerAgent
      .post("/api/v1/billing/subscribe")
      .send({ plan: "multi" });
    expect(calls.at(-1)[1].start_at).toBe(unix(periodEnd));
    const newId = res.body.data.checkout.subscriptionId;

    // Nothing is cancelled until the new plan is authorised...
    expect(calls.some(([kind]) => kind === "cancel")).toBe(false);
    await webhook("subscription.authenticated", {
      id: newId,
      status: "authenticated",
      start_at: unix(periodEnd),
    });

    // ...then the old one ends with its paid month.
    expect(calls).toContainEqual(["cancel", oldId, true]);
    expect(await billingOf(ownerAgent)).toMatchObject({
      status: "cancelling",
      plan: "clinic",
      scheduled: { plan: "multi" },
    });
  });

  it("cancels at the end of the paid month", async () => {
    const { ownerAgent, receptionistAgent, clinicId } = await setup();
    await endTrial(clinicId);
    const id = await activeOn(ownerAgent, "clinic");

    expect(
      (await receptionistAgent.post("/api/v1/billing/cancel")).status,
    ).toBe(403);
    const res = await ownerAgent.post("/api/v1/billing/cancel");
    expect(res.status).toBe(200);
    expect(calls).toContainEqual(["cancel", id, true]);
    expect(res.body.data.billing).toMatchObject({
      status: "cancelling",
      access: "full",
    });
  });
});

describe("platform admin", () => {
  const ADMIN = { email: "ops@clinix.test", password: "platform-pass-1" };

  it("can extend a trial or record a plan paid outside Razorpay", async () => {
    const { ownerAgent, clinicId } = await setup();
    await endTrial(clinicId, 30);
    await PlatformAdmin.create({
      name: "Ops",
      email: ADMIN.email,
      passwordHash: await PlatformAdmin.hashPassword(ADMIN.password),
    });
    const admin = request.agent(app);
    await admin.post("/api/v1/platform/auth/login").send(ADMIN);

    const paidUntil = new Date(Date.now() + 90 * DAY).toISOString();
    const res = await admin
      .patch(`/api/v1/platform/clinics/${clinicId}/billing`)
      .send({
        manualPlan: "clinic",
        manualPaidUntil: paidUntil,
        manualNote: "Bank transfer, 3 months",
      });
    expect(res.status).toBe(200);
    expect(res.body.data.billing).toMatchObject({
      status: "manual",
      plan: "clinic",
      access: "full",
    });
    expect(await billingOf(ownerAgent)).toMatchObject({
      status: "manual",
      plan: "clinic",
    });

    const detail = await admin.get(`/api/v1/platform/clinics/${clinicId}`);
    expect(detail.body.data.billing).toMatchObject({
      status: "manual",
      plan: "clinic",
    });
    expect((await ownerAgent.get("/api/v1/billing")).status).toBe(200);
  });

  it("needs a platform session", async () => {
    const { ownerAgent, clinicId } = await setup();
    expect(
      (
        await ownerAgent
          .patch(`/api/v1/platform/clinics/${clinicId}/billing`)
          .send({ trialEndsAt: null })
      ).status,
    ).toBe(401);
  });
});
