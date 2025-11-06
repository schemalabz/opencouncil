export const env = {
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb?schema=public',
    DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb?schema=public',
    RESEND_API_KEY: process.env.RESEND_API_KEY || 'test-resend-key',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'test-nextauth-secret',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || 'test-google-key',
    DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT || 'https://example.com',
    DO_SPACES_KEY: process.env.DO_SPACES_KEY || 'test-key',
    DO_SPACES_SECRET: process.env.DO_SPACES_SECRET || 'test-secret',
    DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET || 'test-bucket',
    CDN_URL: process.env.CDN_URL || 'https://example.com',
    TASK_API_URL: process.env.TASK_API_URL || 'https://example.com',
    TASK_API_KEY: process.env.TASK_API_KEY || 'test-task-key',
    ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || 'https://example.com',
    ELASTICSEARCH_API_KEY: process.env.ELASTICSEARCH_API_KEY || 'test-es-key',
    DEV_TEST_CITY_ID: process.env.DEV_TEST_CITY_ID || 'testcity',
    SEED_DATA_URL: process.env.SEED_DATA_URL || 'https://example.com/seed.json',
    SEED_DATA_PATH: process.env.SEED_DATA_PATH || './prisma/seed_data.json',
    BIRD_API_KEY: process.env.BIRD_API_KEY || 'test-bird',
    BIRD_WORKSPACE_ID: process.env.BIRD_WORKSPACE_ID || 'test-workspace',
    BIRD_WHATSAPP_CHANNEL_ID: process.env.BIRD_WHATSAPP_CHANNEL_ID || 'test-channel',
    BIRD_SMS_CHANNEL_ID: process.env.BIRD_SMS_CHANNEL_ID || 'test-sms',
    BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING: process.env.BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING || 'tmpl-before',
    BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING: process.env.BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING || 'tmpl-after',
    BIRD_WHATSAPP_TEMPLATE_WELCOME: process.env.BIRD_WHATSAPP_TEMPLATE_WELCOME || 'tmpl-welcome',
}




