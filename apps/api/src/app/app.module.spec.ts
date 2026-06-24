import { configSchema } from './app.module';

// Prevent the ConfigModule from trying to load from process.env.
jest.mock('@nestjs/config', () => ({ ConfigModule: { forRoot: jest.fn() } }));

describe('configSchema', () => {
    const validInput = {
        PORT: '1234',
        BUILD_VERSION: 'test version',
        APIGEE_ORGANIZATION: 'test-org',
        APIGEE_CLIENT_ID: 'test-client-id',
    };
    const validOutput = {
        PORT: 1234,
        BUILD_VERSION: 'test version',
        APIGEE_ORGANIZATION: 'test-org',
        APIGEE_CLIENT_ID: 'test-client-id',
        USE_REAL_DATA: 'false',
    };
    // 11-4 — defaults the schema applies on top of validOutput only when validation succeeds.
    const validDefaults = {
        USE_REAL_PLANVIEW: 'false',
        DIGEST_SCHEDULE: '0 13 * * MON',
        DIGEST_DELIVERY_MODE: 'api',
    };

    it('parses valid values', () => {
        const value = validInput;
        expect(configSchema.validate(value)).toStrictEqual({
            value: { ...validOutput, ...validDefaults },
        });
    });

    it('has a default PORT', () => {
        const { PORT, ...value } = validInput;
        expect(configSchema.validate(value)).toStrictEqual({
            value: {
                ...validOutput,
                ...validDefaults,
                PORT: 8080,
            },
        });
    });

    it('requires PORT to be an integer', () => {
        const value = {
            ...validInput,
            PORT: '1234.5',
        };
        expect(configSchema.validate(value)).toStrictEqual({
            error: expect.any(Error),
            value: {
                ...validOutput,
                PORT: '1234.5',
            },
        });
    });

    it('has a default BUILD_VERSION', () => {
        const { BUILD_VERSION, ...value } = validInput;
        expect(configSchema.validate(value)).toStrictEqual({
            value: {
                ...validOutput,
                ...validDefaults,
                BUILD_VERSION: '0.0.1',
            },
        });
    });
});
