// Creates the three Clinix plans (config/plans.js) in Razorpay and prints
// the RAZORPAY_PLAN_* lines to put in .env / the Render dashboard.
//
// Run once per Razorpay mode: with test keys for test mode, and again with
// live keys when going live (plans don't carry over between modes). Each
// run creates NEW plans - Razorpay plans can't be edited - so only run it
// again to change a price, then switch the env vars to the new ids.
//
//   node server/scripts/create-razorpay-plans.js --dry-run   # show what it would create
//   node server/scripts/create-razorpay-plans.js
/* eslint-disable no-console -- this whole file's job is CLI output */
import { env } from "../src/config/env.js";
import { PLANS, PLAN_CODES } from "../src/config/plans.js";
import { razorpayClient } from "../src/services/razorpayClient.js";

const dryRun = process.argv.includes("--dry-run");
const ENV_NAMES = {
  starter: "RAZORPAY_PLAN_STARTER",
  clinic: "RAZORPAY_PLAN_CLINIC",
  multi: "RAZORPAY_PLAN_MULTI",
};

const keyId = env.billing.razorpay.keyId ?? "";
const mode = keyId.startsWith("rzp_live_")
  ? "LIVE"
  : keyId.startsWith("rzp_test_")
    ? "test"
    : null;
if (!mode || !env.billing.razorpay.keySecret) {
  console.error(
    "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing or not Razorpay keys.",
  );
  process.exit(1);
}
console.log(
  `Razorpay ${mode} mode${dryRun ? " (dry run - nothing is created)" : ""}\n`,
);

const lines = [];
for (const code of PLAN_CODES) {
  const plan = PLANS[code];
  const body = {
    period: "monthly",
    interval: 1,
    item: {
      name: `Clinix ${plan.name}`,
      amount: plan.pricePaise,
      currency: "INR",
      description: `Clinix ${plan.name} plan, monthly`,
    },
    notes: { clinixPlan: code },
  };
  if (dryRun) {
    console.log(
      `would create: ${body.item.name}, Rs. ${plan.pricePaise / 100}/month`,
    );
    continue;
  }
  const created = await razorpayClient.createPlan(body);
  console.log(
    `created: ${body.item.name}, Rs. ${plan.pricePaise / 100}/month -> ${created.id}`,
  );
  lines.push(`${ENV_NAMES[code]}=${created.id}`);
}

if (lines.length)
  console.log(`\nAdd to .env (and the Render dashboard):\n${lines.join("\n")}`);
