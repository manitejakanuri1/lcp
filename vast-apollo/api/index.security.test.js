import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ role: 'founder' }));

const supabaseMock = vi.hoisted(() => ({
    auth: {
        getUser: vi.fn(async () => ({
            data: { user: { id: '00000000-0000-4000-8000-000000000001', email: 'tester@example.com' } },
            error: null,
        })),
        signInWithPassword: vi.fn(async () => ({
            data: null,
            error: new Error('Invalid login credentials'),
        })),
    },
    from: vi.fn((table) => {
        if (table !== 'profiles') throw new Error(`Unexpected table access: ${table}`);
        return {
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(async () => ({
                        data: { role: state.role, username: 'tester' },
                        error: null,
                    })),
                })),
            })),
        };
    }),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => supabaseMock }));

let app;

beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough';
    ({ default: app } = await import('./index.js'));
});

beforeEach(() => {
    state.role = 'founder';
    vi.clearAllMocks();
});

describe('API security boundary', () => {
    it('rejects protected business data without authentication', async () => {
        const response = await request(app).get('/api/products');
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Access denied');
    });

    it('rejects disallowed browser origins', async () => {
        const response = await request(app)
            .options('/api/health')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'GET');
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows the configured production origin', async () => {
        const response = await request(app)
            .options('/api/health')
            .set('Origin', 'https://vast-apollo.vercel.app')
            .set('Access-Control-Request-Method', 'GET');
        expect(response.headers['access-control-allow-origin']).toBe('https://vast-apollo.vercel.app');
    });

    it('enforces role authorization using a fresh profile lookup', async () => {
        state.role = 'salesman';
        const response = await request(app)
            .get('/api/analytics/summary')
            .set('Authorization', 'Bearer valid-test-token');
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Insufficient permissions');
    });

    it('prevents accounting users from modifying inventory', async () => {
        state.role = 'accounting';
        const response = await request(app)
            .post('/api/products')
            .set('Authorization', 'Bearer valid-test-token')
            .send({ sku: 'SEC-001' });
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Founder access required');
    });

    it('rejects oversized JSON bodies', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ username: 'large-body-test', password: `Aa1!${'x'.repeat(300_000)}` });
        expect(response.status).toBe(413);
    });

    it('rate limits repeated invalid login attempts', async () => {
        const username = `rate-limit-${Date.now()}`;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ username, password: 'WrongPassword1!' });
            expect(response.status).toBe(401);
        }
        const blocked = await request(app)
            .post('/api/auth/login')
            .send({ username, password: 'WrongPassword1!' });
        expect(blocked.status).toBe(429);
    });

    it('sets baseline security headers', async () => {
        const response = await request(app).get('/api/health');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(response.headers['cache-control']).toBe('no-store');
    });
});
