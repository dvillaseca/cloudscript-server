require('dotenv').config();
const ws = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const key = crypto.randomBytes(32)
    const ha = crypto.createHmac('sha256', key).update(a).digest()
    const hb = crypto.createHmac('sha256', key).update(b).digest()
    return ha.length === hb.length && crypto.timingSafeEqual(Buffer.from(ha), Buffer.from(hb)) && a === b;
}
class CloudscriptRemoteClient {
    constructor(socket) {
        this.socket = socket;
        this.startCloudscript = this.startCloudscript.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.close = this.close.bind(this);
        this.ping = this.ping.bind(this);
        this.checkAuth = this.checkAuth.bind(this);
        this.socket.on('message', this.handleMessage);
        this.socket.once('close', this.close);
        this.filename = `./cloudscript.${crypto.randomUUID().toString()}.js`;
        this.interval = null;
        this.titleId = null;
        this.titleSecret = null;
        this.authenticated = false;
    }
    startCloudscript() {
        this.serverInstance = spawn(process.execPath, [path.join(__dirname, 'cloudscript-remote-runner.js'), this.filename, this.titleId, this.titleSecret], {
            detached: true,
            stdio: 'pipe'
        });
        this.serverInstance.stdout.on('data', data => {
            try {
                let response = JSON.parse(data.toString());
                switch (response.type) {
                    case 'response':
                    case 'playfab-log':
                    case 'error-log':
                        this.socket.send(data.toString());
                        return;
                    default:
                        break;
                }
            }
            catch (e) {

            }
            try {
                this.socket.send(JSON.stringify({ type: 'log', data: data.toString() }));
            }
            catch (e) {

            }
        });
        this.serverInstance.stderr.on('data', data => {
            try {
                this.socket.send(JSON.stringify({ type: 'error', data: data.toString() }));
            }
            catch (e) {

            }
        });
        this.interval = setInterval(this.ping, 5000);
        this.socket.send(JSON.stringify({ type: 'log', data: 'remote server started!' }));
    }
    async handleMessage(message) {
        message = message.toString();
        try {
            let parsed = JSON.parse(message);
            switch (parsed.type) {
                case 'request':
                    if (!this.authenticated)
                        return;
                    if (this.serverInstance != null)
                        this.serverInstance.stdin.write(JSON.stringify(parsed.data));
                    break;
                case 'create':
                    if (!this.checkAuth(parsed.auth)) {
                        this.socket.send(JSON.stringify({ type: 'log', data: 'auth failed!' }));
                        return this.close();
                    }
                    this.authenticated = true;
                    let uncompressed = await gunzip(Buffer.from(parsed.data, 'base64'));
                    await fs.writeFile(this.filename, uncompressed);
                    this.titleId = parsed.titleId;
                    this.titleSecret = parsed.titleSecret;
                    this.startCloudscript();
                    break;
                default:
                    break;
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    checkAuth(auth) {
        try {
            if (typeof auth != 'string')
                return false;
            return safeCompare(auth, process.env['REMOTE_SERVER_AUTH']);
        }
        catch (e) {

        }
        return false;
    }
    ping() {
        if (this.serverInstance != null)
            this.serverInstance.stdin.write('1');
    }
    async close() {
        try {
            if (this.interval != null)
                clearInterval(this.interval);
        }
        catch (e) {

        }
        try {
            if (this.serverInstance != null)
                this.serverInstance.kill();
        }
        catch (e) {

        }
        try {
            if (this.socket != null)
                this.socket.close();
        }
        catch (e) {

        }
        try {
            await fs.unlink(this.filename);
        }
        catch (e) {

        }
        this.socket = null;
        this.serverInstance = null;
        this.interval = null;
    }
}
const wss = new ws.WebSocketServer({ port: 8040 });
wss.on('connection', function connection(socket) {
    let client = new CloudscriptRemoteClient(socket);
});
console.log("websocket server started");