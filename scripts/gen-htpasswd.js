const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const user = process.argv[2] || process.env.ADMIN_USER || 'admin';
const pass = process.argv[3] || process.env.ADMIN_PASSWORD || 'admin123';

const hash = crypto.createHash('sha1').update(pass).digest('base64');
const line = `${user}:{SHA}${hash}\n`;

const targetPath = path.resolve(__dirname, '../deploy/cloudflare/.htpasswd');
fs.writeFileSync(targetPath, line, 'utf-8');
console.log(`[Security Guard] Successfully generated .htpasswd for user "${user}" at ${targetPath}`);
