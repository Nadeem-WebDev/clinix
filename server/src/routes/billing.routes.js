import { Router } from "express";
import {
  getBillingHandler,
  startSubscriptionHandler,
  confirmCheckoutHandler,
  cancelSubscriptionHandler,
} from "../controllers/billing.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validateBody } from "../middleware/validate.js";
import {
  startSubscriptionSchema,
  confirmCheckoutSchema,
} from "../validators/billing.validators.js";

// The clinic's Clinix subscription (not patient bills - those are
// /invoices). Everyone can see the state, for the banner; only the owner
// pays or cancels. These stay open when the clinic is read-only, so the
// owner can always pay to get out of it.
const router = Router();

router.use(authenticate);
router.get("/", getBillingHandler);
router.post(
  "/subscribe",
  authorize("owner"),
  validateBody(startSubscriptionSchema),
  startSubscriptionHandler,
);
router.post(
  "/confirm",
  authorize("owner"),
  validateBody(confirmCheckoutSchema),
  confirmCheckoutHandler,
);
router.post("/cancel", authorize("owner"), cancelSubscriptionHandler);

export default router;
