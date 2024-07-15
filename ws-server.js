const ws = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
class CloudscriptRemoteClient {
    constructor(socket) {
        this.socket = socket;
        this.startCloudscript = this.startCloudscript.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.close = this.close.bind(this);
        this.ping = this.ping.bind(this);
        this.socket.on('message', this.handleMessage);
        this.socket.once('close', this.close);
        this.filename = `./cloudscript.${crypto.randomUUID().toString()}.js`;
        this.interval = null;
        this.titleId = null;
        this.titleSecret = null;
    }
    startCloudscript() {
        this.serverInstance = spawn(process.execPath, [path.join(__dirname, 'cloudscript-remote-runner.js'), this.filename, this.titleId, this.titleSecret], {
            detached: true,
            stdio: 'pipe'
        });
        this.serverInstance.stdout.on('data', data => {
            try {
                let response = JSON.parse(data.toString());
                if (response.requestId != null) {
                    this.socket.send(JSON.stringify({ type: 'response', data: response }));
                }
                return;
            }
            catch (e) {

            }
            this.socket.send(JSON.stringify({ type: 'log', data: data.toString() }));
        });
        this.serverInstance.stderr.on('data', data => {
            this.socket.send(JSON.stringify({ type: 'error', data: data.toString() }));
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
                    if (this.serverInstance != null)
                        this.serverInstance.stdin.write(JSON.stringify(parsed.data));
                    break;
                case 'create':
                    await fs.writeFile(this.filename, parsed.data);
                    this.titleId = parsed.titleId;
                    this.titleSecret = parsed.titleSecret;
                    this.startCloudscript();
                    break;
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    ping() {
        if (this.serverInstance != null)
            this.serverInstance.stdin.write('1');
    }
    async close() {
        if (this.interval != null)
            clearInterval(this.interval);
        if (this.serverInstance != null)
            this.serverInstance.kill();
        this.serverInstance = null;
        this.interval = null;
        try {
            await fs.unlink(this.filename);
        }
        catch (e) {
            console.error(e);
        }
    }
}
const wss = new ws.WebSocketServer({ port: 8040 });
wss.on('connection', function connection(socket) {
    let client = new CloudscriptRemoteClient(socket);
});