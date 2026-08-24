const WebSocket = require('ws');
const https = require('https');
const http = require('http');

const CONFIG = {
    serverWs: 'wss://s39.agma.io:5006',
    webhook: 'https://discord.com/api/webhooks/1531722060605292649/KjdfGxANoH89_t8wiRfn8-Foxlm6KqLGSgX3nYYa-q1aAgC4A2b5ZMZUqZVTKLiJ8cfD',
    flushInterval: 3000
};

// Servidor HTTP simple para que Render marque el servicio como "Live"
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Agma Discord Logger Online\n');
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

function connect() {
    console.log('[*] Conectando a Agma...');
    const ws = new WebSocket(CONFIG.serverWs, {
        headers: { 'Origin': 'https://agma.io' }
    });

    ws.binaryType = 'arraybuffer';

    ws.on('open', () => {
        console.log('[+] Conectado al servidor de Agma.');
        const handshake = Buffer.alloc(14);
        handshake.writeUInt8(245, 0);
        handshake.writeUInt16LE(62, 1);
        handshake.writeUInt16LE(158, 3);
        handshake.writeUInt32LE(123456, 5);
        ws.send(handshake);

        setTimeout(() => {
            const spec = Buffer.alloc(1);
            spec.writeUInt8(12, 0);
            ws.send(spec);
        }, 1000);
    });

    ws.on('message', (data) => {
        const buf = Buffer.from(data);
        let offset = 0;

        if (buf.readUInt8(0) === 240) offset += 5;
        const opcode = buf.readUInt8(offset);

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
                console.log(line);
                msgBuffer.push(line);
            }
        }
    });

    ws.on('close', () => {
        console.log('[-] Desconectado. Reconectando en 5s...');
        setTimeout(connect, 5000);
    });

    ws.on('error', () => {
        ws.close();
    });
}

connect();
