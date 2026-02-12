// Script to create the founder user via API
// Run this after deploying to create the founder account

const SUPABASE_URL = 'https://ndheubawdszpumtzwolm.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kaGV1YmF3ZHN6cHVtdHp3b2xtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5MzU4OCwiZXhwIjoyMDg1MjY5NTg4fQ.H53KchgHBufFSV0rDu_fZ4YTHuSs1KFWoZeVK3kcRG0';

async function createFounderUser() {
    try {
        // Create auth user using Supabase Admin API
        const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'apikey': SUPABASE_SERVICE_KEY
            },
            body: JSON.stringify({
                email: 'srinu@lakshmisareemandir.com',
                password: 'srinu123',
                email_confirm: true,
                user_metadata: {
                    full_name: 'Srinu (Founder)',
                    role: 'founder',
                    username: 'srinu'
                }
            })
        });

        const authData = await authResponse.json();
        
        if (!authResponse.ok) {
            console.error('Failed to create auth user:', authData);
            return;
        }

        console.log('Auth user created:', authData.id);

        // Create profile
        const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'apikey': SUPABASE_SERVICE_KEY,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({
                id: authData.id,
                email: 'srinu@lakshmisareemandir.com',
                username: 'srinu',
                full_name: 'Srinu (Founder)',
                role: 'founder'
            })
        });

        const profileData = await profileResponse.json();

        if (!profileResponse.ok) {
            console.error('Failed to create profile:', profileData);
            return;
        }

        console.log('✅ Founder user created successfully!');
        console.log('Username: srinu');
        console.log('Password: srinu123');
        console.log('Role: founder');

    } catch (error) {
        console.error('Error creating founder user:', error);
    }
}

createFounderUser();
