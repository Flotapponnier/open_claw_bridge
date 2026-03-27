// Run with: node server.js
// Then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Mock data
const mockSkills = [
    { name: 'github', description: 'GitHub repositories and issues management' },
    { name: 'slack', description: 'Send messages and read channels' },
    { name: 'gmail', description: 'Read and send emails' },
    { name: 'notion', description: 'Manage pages and databases' },
    { name: 'stripe', description: 'Payment processing and customer management' }
];

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

    // Mock GET /api/openclaw/status
    if (method === 'GET' && url === '/api/openclaw/status') {
        const token = req.headers.authorization;
        const gatewayUrl = req.headers['x-gateway-url'];

        console.log('Status check:', { gatewayUrl, token: token ? 'present' : 'missing' });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: true,
            version: 'mock-1.0.0',
            gateway: gatewayUrl || 'unknown'
        }));
        return;
    }

    // Mock GET /api/openclaw/skills
    if (method === 'GET' && url === '/api/openclaw/skills') {
        const token = req.headers.authorization;

        console.log('Skills fetch:', { token: token ? 'present' : 'missing' });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            skills: mockSkills
        }));
        return;
    }

    // POST /api/connect
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

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Skills connected successfully',
                    connectedSkills: payload.selectedSkills
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
