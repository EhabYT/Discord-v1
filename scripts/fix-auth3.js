const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/auth.js', 'utf8');

// Fix missing blank line
content = content.replace(
    'function googleOAuthConfigurationIssue() {',
    '\nfunction googleOAuthConfigurationIssue() {'
);

// Fix the regex to be more lenient for Google client IDs
const oldRegex = "if (!/^([a-zA-Z0-9_-]{20,40})$/.test(clientId))";
const newRegex = "if (!clientId || clientId.length < 10)";
content = content.replace(oldRegex, newRegex);

fs.writeFileSync('backend/src/routes/auth.js', content);
console.log('Fixed');
