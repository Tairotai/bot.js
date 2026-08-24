const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const CONFIG = {
    // Si no conecta en 5006, cambia a 's39.agma.io:452' (puerto nativo de s39)
    host: 's39.agma.io:452', 
    webhook: 'https://discord.com/api/webhooks/1531722060605292649/KjdfGxANoH89_t8wiRfn8-Foxlm6KqLGSgX3nYYa-q1aAgC4A2b5ZMZUqZVTKLiJ8cfD',
    flushInterval: 3000
};

// Servidor HTTP para Render
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Agma Chat Logger Live\n');
}).listen(PORT, () => {
    console.log(`[+] Servidor web escuchando en puerto ${PORT}`);
});

let msgBuffer = [];

function sendDiscordBatch() {
    if (msgBuffer.length === 0) return;
    const content = msgBuffer.join('\n').slice(0, 1900);
    msgBuffer = [];

    const url = new URL(CONFIG.webhook);
    const data = JSON.stringify({ content: content });

    const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    });

    req.on('error', () => {});
    req.write(data);
    req.end();
}

setInterval(sendDiscordBatch, CONFIG.flushInterval);

function calculateChecksum(buffer, a, b, offset) {
    let n = 12354678 + offset;
    for (let i = 0; i < b; i++) {
        n += buffer[a + i] * (i + 4);
    }
    return (n + 3) >>> 0;
}

function connect() {
    const cleanHost = CONFIG.host.replace(/^wss?:\/\//, '');
    const domainOnly = cleanHost.split(':')[0];
    const targetUrl = `wss://${cleanHost}`;

    console.log(`[*] Conectando a ${targetUrl}...`);

    const ws = new WebSocket(targetUrl, ['WebSocket'], {
        headers: {
            'Origin': 'https://agma.io',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        servername: domainOnly,
        rejectUnauthorized: false
    });

    ws.binaryType = 'arraybuffer';

    ws.on('open', () => {
        console.log('[+] Conectado. Enviando Handshake 245...');
        
        const handshake = Buffer.alloc(14);
        const randomSeed = Math.floor(1 + (53550 + 600000 * Math.random()));
        
        handshake.writeUInt8(245, 0);
        handshake.writeUInt16LE(62, 1);
        handshake.writeUInt16LE(158, 3);
        handshake.writeUInt32LE(randomSeed, 5);
        
        const checksum = calculateChecksum(handshake, 0, 9, 245);
        handshake.writeUInt32LE(checksum, 9);
        
        ws.send(handshake);
    });

    ws.on('message', (data) => {
        const buf = Buffer.from(data);
        let offset = 0;

        if (buf.readUInt8(0) === 240) offset += 5;
        const opcode = buf.readUInt8(offset);

        // Opcode 64: Configuración inicial del mapa -> Solicitar modo espectador
        if (opcode === 64) {
            const spec = Buffer.alloc(1);
            spec.writeUInt8(12, 0);
            ws.send(spec);
            console.log('[+] Modo espectador activo. Escuchando chat...');
        }

        // Opcode 99: Chat Message
        if (opcode === 99) {
            offset += 1;
            const flags = buf.readUInt8(offset); offset += 1;
            offset += 2;

            if (flags & 4) offset += 4;
            offset += 3;

            let name = '';
            while (offset < buf.length) {
                const charCode = buf.readUInt16LE(offset);
                offset += 2;
                if (charCode === 0) break;
                name += String.fromCharCode(charCode);
            }

            if (flags & 2) {
                while (offset < buf.length) {
                    const charCode = buf.readUInt16LE(offset);
                    offset += 2;
                    if (charCode === 0) break;
                }
            }

            let msg = '';
            while (offset < buf.length) {
                const charCode = buf.readUInt16LE(offset);
                offset += 2;
                if (charCode === 0) break;
                msg += String.fromCharCode(charCode);
            }

            if (msg.trim().length > 0) {
                const line = `**${name || 'Agma.io'}**: ${msg}`;
                console.log(`[CHAT] ${line}`);
                msgBuffer.push(line);
            }
        }
    });

    ws.on('close', () => {
        console.log('[-] Desconectado. Reconectando en 5s...');
        setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
        console.error('[!] Error:', err.message);
        ws.close();
    });
}

connect();
