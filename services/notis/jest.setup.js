// Unit tests never touch a database or validated env: skip t3-env validation
// and drop any database URLs inherited from the developer's shell so
// hasNotisDb()/hasMainDb() are deterministically false.
process.env.SKIP_ENV_VALIDATION = "1";
delete process.env.NOTIS_DATABASE_URL;
delete process.env.MAIN_DATABASE_URL;
delete process.env.MAIN_SESSION_COOKIE_NAME;
delete process.env.OPENCOUNCIL_BASE_URL;
delete process.env.BIRD_API_KEY;
delete process.env.BIRD_WORKSPACE_ID;
delete process.env.BIRD_WHATSAPP_CHANNEL_ID;
delete process.env.BIRD_SMS_CHANNEL_ID;
delete process.env.BIRD_WEBHOOK_SECRET;
