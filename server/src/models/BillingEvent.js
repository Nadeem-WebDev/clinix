import mongoose from "mongoose";

// Every Razorpay webhook applied, keyed by its x-razorpay-event-id. Razorpay
// may deliver the same event more than once; the unique id makes the second
// delivery a no-op.
const billingEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    razorpaySubscriptionId: { type: String },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: "Clinic" },
  },
  { timestamps: true },
);

export const BillingEvent = mongoose.model("BillingEvent", billingEventSchema);
