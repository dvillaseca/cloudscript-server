
require('colors');
const express = require('express');
const axios = require('axios').default;
const compiler = require('./compiler.js');
const ws = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { deserializeError } = require('serialize-error');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
let cloudscriptResponses = [];
let pongTimeout = null;

const directory = process.argv[3];
require('dotenv').config({ path: path.join(directory, './.env') });

if (process.env['TITLE_ID'] == null) {
    console.log('missing environment variable TITLE_ID'.red);
    process.exit();
}
if (process.env['TITLE_SECRET'] == null) {
    console.log('missing environment variable TITLE_SECRET'.red);
    process.exit();
}
if (process.env['REMOTE_SERVER_URL'] == null) {
    console.log('missing environment variable REMOTE_SERVER_URL'.red);
    process.exit();
}
if (process.env['REMOTE_SERVER_AUTH'] == null) {
    console.log('missing environment variable REMOTE_SERVER_AUTH'.red);
    process.exit();
}
//we do this part to evaluate syntax errors in the file
try {
    require('./cloudscript.js');
}
catch (e) {
    compiler.transformErrorStack(e, directory);
    logError(e);
    process.exit();
}

const titleId = process.env['TITLE_ID'];
let wsClient = null;
async function startCloudscript() {
    const options = {
        rejectUnauthorized: false,
        headers: {
            authorization: process.env['REMOTE_SERVER_AUTH']
        }
    };
    wsClient = new ws.WebSocket(process.env['REMOTE_SERVER_URL'], options);
    wsClient.on('error', err => console.error(err));
    wsClient.on('message', (message) => {
        try {
            let msg = JSON.parse(message.toString());
            switch (msg.type) {
                case 'log':
                    console.log(msg.data);
                    break;
                case 'error':
                    console.error(msg.data);
                    break;
                case 'error-log':
                    logError(deserializeError(msg.data));
                    break;
                case 'playfab-log':
                    handlePlayfabLog(msg.data);
                    break;
                case 'response':
                    cloudscriptResponses.push(msg);
                    break;
                case 'pong':
                    if (pongTimeout != null)
                        clearTimeout(pongTimeout);
                    pongTimeout = setTimeout(exitProgram, 60000);
                    break;
                default:
                    break;
            }
        }
        catch (e) {
        }
    });
    wsClient.on('close', () => {
        console.log('remote connection closed!');
        process.exit(1)
    });
    wsClient.once('open', async () => {
        let fileData = await fs.readFile(path.join(__dirname, 'cloudscript.js'));
        let compressed = await gzip(fileData);
        wsClient.send(JSON.stringify({ type: 'create', auth: process.env['REMOTE_SERVER_AUTH'], titleId: process.env['TITLE_ID'], titleSecret: process.env['TITLE_SECRET'], data: compressed.toString('base64') }));
        pongTimeout = setTimeout(exitProgram, 60000);
        setInterval(() => {
            wsClient.send(JSON.stringify({ type: 'ping' }));
        }, 15000);
    });
}
async function executeCloudScript(req, res) {
    let startTime = Date.now();
    try {
        req.body.PlayFabId = req.body.PlayFabId ?? extractPlayfabidFromToken(req.headers['x-authorization']);//doing this is faster than validating the ticket with the playfab api :P, it can fail obviously
        req.body.requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        wsClient.send(JSON.stringify({ type: 'request', data: req.body }));
        while (!cloudscriptResponses.some(it => it.requestId == req.body.requestId) && Date.now() - startTime < 120000)
            await yield();
        let index = cloudscriptResponses.findIndex(it => it.requestId == req.body.requestId);
        if (index == -1)
            throw new Error("timeout");
        let response = cloudscriptResponses.splice(index)[0];
        if (response.error)
            throw deserializeError(response.error);
        return res.json(response.data);
    }
    catch (e) {
        compiler.transformErrorStackRemote(e, directory);
        logError(e);
        if (e.data?.code != null) {
            return res.status(e.data.code).json(e.data);
        }
        if (e.stack != null) {
            return res.json(generateResponse(200, 'OK', req.body.FunctionName, null, (Date.now() - startTime) * 0.001, {
                Error: "JavascriptException", Message: "JavascriptException", StackTrace: e.stack
            }));
        }
        return res.status(500).json({ error: 'Unknown', code: 500 });
    }
}
async function yield() {
    return new Promise((resolve) => setTimeout(resolve, 1));
}
function generateResponse(code, status, FunctionName, FunctionResult, ExecutionTimeSeconds, Error) {
    return {
        code,
        status,
        data: {
            FunctionName,
            Revision: 0,
            FunctionResult,
            APIRequestsIssued: 0,
            HttpRequestsIssued: 0,
            ExecutionTimeSeconds,
            Logs: [],
            Error
        }
    };
}
function extractPlayfabidFromToken(token) {
    let parts = token.split('-');
    if (parts.length > 1)
        return parts[0];
    let fromBase64 = Buffer.from(token, 'base64').toString('ascii');
    parts = fromBase64.split('|');
    var payload = JSON.parse(parts[2]);
    return payload.ec.split('/')[2];
}
const app = express();

app.use(express.json());

app.post('/Client/ExecuteCloudScript', executeCloudScript);
app.post('/Server/ExecuteCloudScript', executeCloudScript);

//proxy every other request to playfab api
app.use('*', async (req, res) => {
    try {
        let route = req.params[0];
        let url = `https://${titleId}.playfabapi.com${route}`;
        let headers = {};
        for (let key in req.headers) {
            if (key == 'host')
                continue;
            if (key == 'connection')
                continue;
            if (key == 'content-length')
                continue;
            if (key.includes('encoding'))
                continue;
            headers[key] = req.headers[key];
        }
        let response = await axios({
            headers: headers,
            url: url,
            method: req.method,
            data: req.body
        });
        let responseHeaders = response.headers;
        for (let key in responseHeaders) {
            res.setHeader(key, responseHeaders[key]);
        }
        res.status(response.status).json(response.data);
    }
    catch (e) {
        console.error(e);
        res.status(e.response.status).json(e.response.data);
    }
});

async function startServer() {
    let playfab = require('playfab-sdk');
    playfab.settings.titleId = process.env['TITLE_ID'];
    playfab.settings.developerSecretKey = process.env['TITLE_SECRET'];
    let port = parseInt(process.argv[2]);
    app.listen(port);
    console.log(("Server started at port: " + port + "\n").green);
    startCloudscript();
}
startServer();

//used by the global playfab log object
function handlePlayfabLog(data) {
    try {
        let dummy = deserializeError(data.dummyError);
        delete data.dummyError;
        let stackLines = dummy.stack.split('\n');
        stackLines.splice(0, 4);
        dummy.stack = stackLines.join('\n');
        compiler.transformErrorStackRemote(dummy, directory);
        data.Stack = dummy.stack;
        console.log(JSON.stringify(data).yellow);
    }
    catch (e) {

    }
}
//custom colored error
function logError(e) {
    if (e.stack == null) {
        console.error(e);
    }
    else {
        if (typeof e.data == 'object')
            console.error(JSON.stringify(e.data).red);
        console.log(e.stack.red);
    }
}
//listening if monitor is still controlling the process, if not, exit

function exitProgram() {
    process.exit();
}

function listenMonitor() {
    let exitTimeout = setTimeout(exitProgram, 15000);
    process.stdin.on('data', (data) => {
        if (exitTimeout != null)
            clearTimeout(exitTimeout);
        exitTimeout = setTimeout(exitProgram, 15000);
    });
}
listenMonitor();