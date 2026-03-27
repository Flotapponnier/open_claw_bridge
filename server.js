// Run with: node server.js
// Then open http://localhost:3000

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;

// Available skills from YOUR API that OpenClaw can install
const availableSkills = [
    {
        name: 'mobula-market-data',
        description: 'Get crypto market data, prices, and analytics',
        endpoint: 'https://api.mobula.io/api/1/market/data'
    },
    {
        name: 'mobula-wallet-tracking',
        description: 'Track wallet portfolios and transactions',
        endpoint: 'https://api.mobula.io/api/1/wallet/portfolio'
    },
    {
        name: 'mobula-token-info',
        description: 'Get detailed token information',
        endpoint: 'https://api.mobula.io/api/1/metadata'
    }
];

// Helper to install skills to OpenClaw
function installSkillsToOpenClaw(gatewayUrl, token, skills, callback) {
    // Generate SKILL.md content for each skill
    const skillFiles = skills.map(skill => {
        const skillMd = `# ${skill.name}

${skill.description}

## API Endpoint
${skill.endpoint}

## Usage

This skill provides access to Mobula API endpoints.

### Example curl command:
\`\`\`bash
curl -X GET "${skill.endpoint}" \\
  -H "Authorization: Bearer $MOBULA_API_KEY"
\`\`\`

## Parameters

Check the API documentation at https://docs.mobula.io for available parameters.
`;
        return {
            name: skill.name,
            content: skillMd
        };
    });

    // For now, we just prepare the files
    // Real implementation would need to write these files to ~/.openclaw/skills/
    // This could be done via:
    // 1. SSH to the server and write files
    // 2. OpenClaw API endpoint (if it exists)
    // 3. File upload via gateway

    console.log('Generated skill files:', skillFiles.map(f => f.name));

    // Write skills via SSH to the VPS
    const sshHost = 'rescue@57.130.19.92';
    const sshPort = '8822';
    const skillsBasePath = '/home/rescue/.openclaw/skills';

    let completed = 0;
    const total = skillFiles.length;

    if (total === 0) {
        return callback(null);
    }

    skillFiles.forEach(skillFile => {
        const skillDir = `${skillsBasePath}/${skillFile.name}`;
        const skillMdPath = `${skillDir}/SKILL.md`;

        // Escape content for bash
        const escapedContent = skillFile.content.replace(/'/g, "'\\''");

        const command = `ssh -p ${sshPort} ${sshHost} "mkdir -p ${skillDir} && echo '${escapedContent}' > ${skillMdPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error installing ${skillFile.name}:`, error.message);
                return callback(error);
            }

            console.log(`✓ Installed skill: ${skillFile.name}`);
            completed++;

            if (completed === total) {
                console.log(`All ${total} skills installed successfully`);
                callback(null);
            }
        });
    });
}

// Proxy helper
function proxyRequest(baseUrl, path, authHeader, callback) {
    const url = new URL(path, baseUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {}
    };

    if (authHeader) {
        options.headers['Authorization'] = authHeader;
    }

    const proxyReq = protocol.request(options, (proxyRes) => {
        let data = '';

        proxyRes.on('data', (chunk) => {
            data += chunk;
        });

        proxyRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                callback(null, parsed);
            } catch (e) {
                callback(new Error('Invalid JSON response'));
            }
        });
    });

    proxyReq.on('error', (e) => {
        callback(e);
    });

    proxyReq.end();
}

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gateway-URL');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url;
    const method = req.method;

    console.log(`${method} ${url}`);

    // Serve index.html
    if (method === 'GET' && url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Proxy GET /api/openclaw/status
    if (method === 'GET' && url === '/api/openclaw/status') {
        const token = req.headers.authorization;
        const gatewayUrl = req.headers['x-gateway-url'];

        if (!gatewayUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'X-Gateway-URL header required' }));
            return;
        }

        console.log('Proxying status to:', gatewayUrl);

        proxyRequest(gatewayUrl, '/api/status', token, (err, data) => {
            if (err) {
                console.error('Status error:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        });
        return;
    }

    // GET /api/skills - Return YOUR available skills for OpenClaw to install
    if (method === 'GET' && url === '/api/skills') {
        console.log('Returning available skills from our API');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ skills: availableSkills }));
        return;
    }

    // POST /api/connect - Send selected skills to OpenClaw to install
    if (method === 'POST' && url === '/api/connect') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                console.log('\n=== Connection Payload ===');
                console.log(JSON.stringify(payload, null, 2));
                console.log('=========================\n');

                const { gatewayUrl, token, selectedSkills } = payload;

                // Prepare skills config to send to OpenClaw
                const skillsToInstall = availableSkills.filter(skill =>
                    selectedSkills.includes(skill.name)
                );

                console.log('Installing skills to OpenClaw:', skillsToInstall);

                // Install skills by creating SKILL.md files
                installSkillsToOpenClaw(gatewayUrl, token, skillsToInstall, (err) => {
                    if (err) {
                        console.error('Installation error:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Skills installed to OpenClaw successfully',
                        installedSkills: skillsToInstall
                    }));
                });
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`🦞 OpenClaw Widget Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
