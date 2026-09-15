const fs = require('fs');
const content = fs.readFileSync('backend/src/routes/auth.js', 'utf8');

// Insert googleRedirectUriFor before dashboardHomeFor
const marker1 = 'function dashboardHomeFor(req)';
const googleRedirectUriFor = `function googleRedirectUriFor(req) {
    const configured = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
    if (configured) {
        try {
            const uri = new URL(configured);
            if (uri.protocol === 'https:' || uri.protocol === 'http:') {
                return uri.toString().replace(/\\/$/, '');
            }
        } catch {
            logger.warn('GOOGLE_REDIRECT_URI is not a valid HTTP(S) URL');
        }
    }
    const origin = publicOrigin(req);
    if (origin) return \`\${origin}/api/auth/google/callback\`;
    return 'http://localhost:3000/api/auth/google/callback';
}

`;
let newContent = content.replace(marker1, googleRedirectUriFor + marker1);

// Insert googleOAuthConfigurationIssue before oauthRuntimeIssue
const marker2 = '\nasync function oauthRuntimeIssue';
const googleOAuthConfig = `
function googleOAuthConfigurationIssue() {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId) return 'GOOGLE_CLIENT_ID is missing.';
    if (!/^([a-zA-Z0-9_-]{20,40})$/.test(clientId)) return 'GOOGLE_CLIENT_ID must be a valid Google OAuth client ID.';
    if (!clientSecret) return 'GOOGLE_CLIENT_SECRET is missing.';
    return null;
}`;
newContent = newContent.replace(marker2, googleOAuthConfig + marker2);

fs.writeFileSync('backend/src/routes/auth.js', newContent);
console.log('Done inserting functions');
