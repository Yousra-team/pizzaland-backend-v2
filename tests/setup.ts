// Fake values for the env variables some modules read when they are imported.
// jwt.util.ts throws on import without the JWT secrets, and twilioClient.ts / supabase.ts
// build their clients from these. None of them are real: unit tests never reach a real service.
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.YOUSRA_COINS_EXCHANGE_RATE = "25";
process.env.MONETBIL_SERVICE_KEY = "test-monetbil-key";
process.env.SUPABASE_PROJECT_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-key";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-twilio-token";
process.env.TWILIO_WHATSAPP_NUMBER = "+10000000000";
process.env.TWILIO_VERIFY_SERVICE = "VAtest";
