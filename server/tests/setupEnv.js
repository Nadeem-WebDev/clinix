// Runs before every test file (jest.config.js `setupFiles`), before
// src/config/env.js loads the developer's root .env. dotenv never overwrites
// a variable that is already set - even to '' - so pinning these here keeps
// the suite on the shipped defaults (.env.example) whatever the local .env
// holds. Without it, a .env with EMAIL_ENABLED=true and a real Brevo key
// made email.test.js's call-through `fetch` spy send real emails, and the
// "off by default, as shipped" test failed.
//
// Tests that need a service on flip `env.*` directly and mock the client.
const OFF = {
  EMAIL_ENABLED: 'false',
  BREVO_API_KEY: '',
  EMAIL_FROM_ADDRESS: '',
  WHATSAPP_ENABLED: 'false',
  WHATSAPP_PHONE_NUMBER_ID: '',
  WHATSAPP_ACCESS_TOKEN: '',
  WHATSAPP_APP_SECRET: '',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: '',
  BILLING_ENABLED: 'false',
  RAZORPAY_KEY_ID: '',
  RAZORPAY_KEY_SECRET: '',
  RAZORPAY_WEBHOOK_SECRET: '',
  RAZORPAY_PLAN_STARTER: '',
  RAZORPAY_PLAN_CLINIC: '',
  RAZORPAY_PLAN_MULTI: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  KEEP_ALIVE_ENABLED: 'false',
  KEEP_ALIVE_URL: '',
  // Never the real database: every suite uses its own in-memory MongoDB
  // (tests/testDb.js), and this makes a stray env.mongodbUri harmless too.
  MONGODB_URI: 'mongodb://127.0.0.1:1/clinix-tests-must-not-use-this',
}

for (const [key, value] of Object.entries(OFF)) process.env[key] = value
