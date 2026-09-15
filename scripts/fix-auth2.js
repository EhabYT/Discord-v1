const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/auth.js', 'utf8');

// Add googleOAuthEnabled to the status response
const statusMarker = 'oauthEnabled: !oauthError,';
const googleStatus = 'googleOAuthEnabled: !googleOAuthConfigurationIssue(),\n            googleOAuthError: googleOAuthConfigurationIssue(),\n            oauthEnabled: !oauthError,';
content = content.replace(statusMarker, googleStatus);

// Add Google OAuth routes before the module.exports return
// Find the router.get('/status' ...) section and add before it
const statusRoute = "router.get('/status'";
const googleRoutes = `router.get('/google', async (req, res) => {
        const configIssue = googleOAuthConfigurationIssue();
        if (configIssue) {
            return oauthErrorPage(res, 'Google OAuth not configured', configIssue, googleRedirectUriFor(req));
        }
        const redirectUri = googleRedirectUriFor(req);
        req.session.oauthRedirect = redirectUri;
        if (req.session.account?.id && !req.session.user?.id) {
            req.session.oauthLinkAccountId = req.session.account.id;
        } else {
            delete req.session.oauthLinkAccountId;
        }
        const state = crypto.randomBytes(32).toString('hex');
        req.session.oauthState = state;
        req.session.save((err) => {
            if (err) return res.redirect(303, loginResultUrl(req, 'session'));
            const url = \`https://accounts.google.com/o/oauth2/v2/auth?client_id=\${process.env.GOOGLE_CLIENT_ID}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&state=\${state}\`;
            res.redirect(url);
        });
    });

    async function googleOAuthCallback(req, res) {
        if (req.query.error) {
            return oauthErrorPage(
                res,
                'Google login cancelled',
                req.query.error_description || req.query.error,
                req.session.oauthRedirect || googleRedirectUriFor(req)
            );
        }
        const { code } = req.query;
        if (!code) return res.redirect(303, loginResultUrl(req, 'missing_code'));
        const expectedState = req.session.oauthState;
        const gotState = typeof req.query.state === 'string' ? req.query.state : '';
        delete req.session.oauthState;
        const a = Buffer.from(String(expectedState || ''));
        const b = Buffer.from(gotState);
        const stateOk = !!expectedState && a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!stateOk) {
            return oauthErrorPage(res, 'Login verification failed',
                'The login request could not be verified (state mismatch). Start the login again from the dashboard.',
                '');
        }
        const redirectUri = req.session.oauthRedirect || googleRedirectUriFor(req);
        try {
            const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const accessToken = tokenResponse.data.access_token;
            const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: \`Bearer \${accessToken}\` }
            });
            const user = {
                id: userResponse.data.id,
                username: userResponse.data.email.split('@')[0],
                tag: userResponse.data.email,
                avatar: userResponse.data.picture || null
            };
            const linkAccountId = req.session.oauthLinkAccountId || null;
            const account = getPool()
                ? (linkAccountId
                    ? await getAccountStore().linkDiscordIdentity(linkAccountId, user, req.requestId)
                    : await getAccountStore().ensureDiscordAccount(user, req.requestId))
                : null;
            await new Promise((resolve, reject) => {
                req.session.regenerate((sessionErr) => sessionErr ? reject(sessionErr) : resolve());
            });
            if (account?.mfaEnabled) {
                attachMfaChallenge(req.session, account.id, { user, userGuilds: [] });
            } else {
                attachAuthenticatedSession(req.session, user, [], account);
                if (account) attachSessionSecurity(req.session, req);
            }
            await new Promise((resolve, reject) => {
                req.session.save((sessionErr) => sessionErr ? reject(sessionErr) : resolve());
            });
            if (account && !account.mfaEnabled) {
                await getAccountStore().recordSecurityEvent(account.id, 'login_success', req.requestId, { method: 'google' });
            }
            res.redirect(303, account?.mfaEnabled
                ? \`\${dashboardHomeFor(req)}/login?mfa=1\`
                : loginResultUrl(req, 'success'));
        } catch (err) {
            const data = err.response?.data;
            const desc = data?.error || '';
            logger.error('Google OAuth request failed', {
                requestId: req.requestId,
                status: err.response?.status || null,
                googleError: String(desc).slice(0, 80),
            });
            const detail = desc === 'invalid_client'
                ? 'Google rejected the OAuth client credentials. Verify that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET come from the same project.'
                : desc === 'invalid_grant' || String(desc).toLowerCase().includes('redirect')
                    ? 'Redirect URI mismatch. Add the URI below in the Google Cloud Console, then try again.'
                    : data
                        ? String(desc || 'Google rejected the login request.')
                        : 'The login session could not be completed. Please start the login again.';
            oauthErrorPage(res, 'Google login failed', detail, redirectUri);
        }
    }

    router.get('/callback', googleOAuthCallback);
    router.get('/google/callback', googleOAuthCallback);

    `;

// Insert before router.get('/status'
content = content.replace(statusRoute, googleRoutes + statusRoute);

fs.writeFileSync('backend/src/routes/auth.js', content);
console.log('Done adding Google OAuth routes');
