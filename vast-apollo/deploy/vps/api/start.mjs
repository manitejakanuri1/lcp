// Loads Docker secrets into env, then serves the original Vercel Express app.
import { readFileSync, existsSync } from 'node:fs';
const secret = (name) => existsSync(`/run/secrets/${name}`) ? readFileSync(`/run/secrets/${name}`, 'utf8').trim() : undefined;
process.env.SUPABASE_SERVICE_KEY ??= secret('service_role_key');
process.env.JWT_SECRET ??= secret('api_jwt_secret');
const { default: app } = await import('./index.js');
const port = Number(process.env.PORT || 3002);
app.listen(port, '0.0.0.0', () => console.log(`lakshmi-api-full listening on ${port}`));
