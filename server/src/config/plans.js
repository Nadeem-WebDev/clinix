// Clinix's subscription plans - the single source for prices and limits.
// The landing page shows the same three (client/src/pages/Landing.jsx), and
// scripts/create-razorpay-plans.js creates matching plans in Razorpay; the
// Razorpay plan ids then go in RAZORPAY_PLAN_* (config/env.js).
//
// Limits count ACTIVE accounts only, never the owner: "doctors" is role
// doctor, "staff" is admin + receptionist + nurse. null = no limit.
export const PLANS = {
  starter: {
    code: "starter",
    name: "Starter",
    pricePaise: 49900,
    maxDoctors: 1,
    maxStaff: 2,
    messaging: false,
  },
  clinic: {
    code: "clinic",
    name: "Clinic",
    pricePaise: 99900,
    maxDoctors: 3,
    maxStaff: null,
    messaging: true,
  },
  multi: {
    code: "multi",
    name: "Multi-doctor",
    pricePaise: 199900,
    maxDoctors: 5,
    maxStaff: null,
    messaging: true,
  },
};

export const PLAN_CODES = Object.keys(PLANS);

// A trial gets everything, so a clinic can try the whole app.
export const TRIAL_LIMITS = {
  maxDoctors: PLANS.multi.maxDoctors,
  maxStaff: null,
  messaging: true,
};

// Billing switched off (BILLING_ENABLED not 'true'): no limits at all.
export const NO_LIMITS = { maxDoctors: null, maxStaff: null, messaging: true };

export function limitsOf(planCode) {
  const plan = PLANS[planCode];
  return plan
    ? {
        maxDoctors: plan.maxDoctors,
        maxStaff: plan.maxStaff,
        messaging: plan.messaging,
      }
    : TRIAL_LIMITS;
}
