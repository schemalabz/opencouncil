// Use a Proxy so env values are read from process.env at access time,
// not at module load time. This is critical because ensureTestDb() sets
// DATABASE_URL after modules are imported but before tests run.
const defaults: Record<string, string> = {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb?schema=public',
    DIRECT_URL: 'postgresql://test:test@localhost:5432/testdb?schema=public',
    RESEND_API_KEY: 'test-resend-key',
    NEXTAUTH_SECRET: 'test-nextauth-secret',
    GOOGLE_API_KEY: 'test-google-key',
    DO_SPACES_ENDPOINT: 'https://example.com',
    DO_SPACES_KEY: 'test-key',
    DO_SPACES_SECRET: 'test-secret',
    DO_SPACES_BUCKET: 'test-bucket',
    CDN_URL: 'https://example.com',
    TASK_API_URL: 'https://example.com',
    TASK_API_KEY: 'test-task-key',
    ELASTICSEARCH_URL: 'https://example.com',
    ELASTICSEARCH_API_KEY: 'test-es-key',
    DEV_TEST_CITY_ID: 'testcity',
    SEED_DATA_URL: 'https://example.com/seed.json',
    SEED_DATA_PATH: './prisma/seed_data.json',
    BIRD_API_KEY: 'test-bird',
    BIRD_WORKSPACE_ID: 'test-workspace',
    BIRD_WHATSAPP_CHANNEL_ID: 'test-channel',
    BIRD_SMS_CHANNEL_ID: 'test-sms',
    BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING: 'tmpl-before',
    BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING: 'tmpl-after',
    BIRD_WHATSAPP_TEMPLATE_WELCOME: 'tmpl-welcome',
}

export const env = new Proxy(defaults, {
    get: (target, prop: string) => {
        if (prop === 'DIRECT_URL') {
            return process.env.DIRECT_URL || process.env.DATABASE_URL || target[prop]
        }
        return process.env[prop] || target[prop]
    },
})
