// Run with: node server.js
// Then open http://localhost:3000

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

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

                // TODO: Send skills config to OpenClaw via API
                // For now, we just log and return success
                // In real implementation, you would POST to OpenClaw's skill installation endpoint

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Skills sent to OpenClaw successfully',
                    installedSkills: skillsToInstall
                }));
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
