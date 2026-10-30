const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const repoRoot = path.resolve(__dirname, '../..');
const webRoot = path.join(repoRoot, 'apps/web');
const webRequire = createRequire(path.join(webRoot, 'package.json'));
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');

(async () => {
  const viteModule = await import(pathToFileURL(webRequire.resolve('vite')).href);
  const { createServer } = viteModule;
  const vite = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { default: OAuthButtons } = await vite.ssrLoadModule('/src/auth/OAuthButtons.jsx');
    const { default: AuthLayout } = await vite.ssrLoadModule('/src/auth/AuthLayout.jsx');
    const render = (auth, mode = 'signup') => renderToStaticMarkup(
      React.createElement(OAuthButtons, { auth, mode })
    );

    const authLayout = renderToStaticMarkup(React.createElement(AuthLayout, {
      eyebrow: 'Welcome',
      title: 'Sign in',
      description: 'Access your dashboard',
      children: null,
    }));
    assert.match(authLayout, /<section class="glass-panel p-5 sm:p-7 relative overflow-hidden">/);
    assert.doesNotMatch(authLayout, /<section[^>]*\bgradient-border\b/);
    assert.doesNotMatch(authLayout, /inset-x-0 top-0 h-px bg-gradient-to-r/);

    const unavailable = render({ oauthEnabled: false, googleOAuthEnabled: false });
    assert.match(unavailable, /Sign up with Discord/);
    assert.match(unavailable, /Sign up with Google/);
    assert.match(unavailable, /aria-disabled="true"/);
    assert.match(unavailable, /id="oauth-discord-status"/);
    assert.match(unavailable, /id="oauth-google-status"/);
    assert.match(unavailable, /Social sign-in is not configured on this server yet\./);
    assert.equal((unavailable.match(/<button\b/g) || []).length, 2);
    assert.equal((unavailable.match(/<a\b/g) || []).length, 0);
    assert.doesNotMatch(unavailable, /<button\b[^>]*\sdisabled(?:=""|\s|>)/);
    assert.match(unavailable, /<svg\b[^>]*viewBox="0 0 24 24"/);

    const enabled = render({ oauthEnabled: true, googleOAuthEnabled: true });
    assert.match(enabled, /href="\/api\/auth\/discord"/);
    assert.match(enabled, /href="\/api\/auth\/google"/);
    assert.equal((enabled.match(/<a\b/g) || []).length, 2);
    assert.doesNotMatch(enabled, /aria-disabled="true"/);

    console.log('OAuth provider visibility and availability checks passed.');
  } finally {
    await vite.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
