import mongoose from "mongoose";
import { PLAN_CODES } from "../config/plans.js";

// RAZORPAY_STATUSES are Razorpay's own subscription states, stored as
// received (docs: Subscriptions -> States). A clinic can have several rows:
// changing plan starts a new Razorpay subscription and cancels the old one,
// and an abandoned checkout leaves a 'created' one behind. Which row counts
// right now is decided in billing.service.js (resolveBilling).
export const RAZORPAY_STATUSES = [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "paused",
  "cancelled",
  "completed",
  "expired",
];

const clinicSubscriptionSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
      index: true,
    },
    plan: { type: String, enum: PLAN_CODES, required: true },
    razorpaySubscriptionId: { type: String, required: true, unique: true },
    status: { type: String, enum: RAZORPAY_STATUSES, required: true },
    // When charging starts (a subscription taken during a trial, or a plan
    // change, starts when the current paid time ends).
    startAt: { type: Date },
    currentStart: { type: Date },
    currentEnd: { type: Date },
    chargeAt: { type: Date },
    endedAt: { type: Date },
    paidCount: { type: Number, default: 0 },
    // Our own request to stop at the end of the paid month - Razorpay keeps
    // the status 'active' until then.
    cancelAtCycleEnd: { type: Boolean, default: false },
    // First failed charge in the current run of failures; the grace period
    // counts from here. Cleared once a charge succeeds.
    failingSince: { type: Date },
    // When a newer subscription replaced this one (and we asked Razorpay to
    // cancel it), so that is only done once.
    supersededAt: { type: Date },
    // Time of the newest Razorpay event applied, so a late, older webhook
    // can't move the status backwards.
    lastEventAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const ClinicSubscription = mongoose.model(
  "ClinicSubscription",
  clinicSubscriptionSchema,
);
