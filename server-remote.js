
require('colors');
const express = require('express');
const axios = require('axios').default;
const compiler = require('./compiler.js');
const ws = require('ws');
const fs = require('fs').promises;
const path = require('path');
let pendingResponses = {};

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

const titleId = process.env['TITLE_ID'];
let wsClient = null;
async function startCloudscript() {
    wsClient = new ws.WebSocket('ws://127.0.0.1:8040');
    wsClient.on('error', err => console.error(err));
    wsClient.on('message', (message) => {
        try {
            let data = JSON.parse(message.toString());
            switch (data.type) {
                case 'log':
                    console.log(data.data);
                    break;
                case 'error':
                    console.error(data.data);
                    break;
                case 'response':
                    let response = data.data;
                    let requestId = response.requestId;
                    if (requestId != null) {
                        delete response.requestId;
                        if (response.code != null)
                            pendingResponses[requestId] = pendingResponses[requestId].status(response.code);
                        pendingResponses[requestId].json(response);
                        delete pendingResponses[requestId];
                    }
                    break;
                default:
                    break;
            }
        }
        catch (e) {
        }
    });
    wsClient.on('close', () => {
        process.exit(1)
    });
    wsClient.once('open', async () => {
        let fileData = await fs.readFile(path.join(__dirname, 'cloudscript.js'), 'utf-8');
        wsClient.send(JSON.stringify({ type: 'create', titleId: process.env['TITLE_ID'], titleSecret: process.env['TITLE_SECRET'], data: fileData }));
    })
}
async function executeCloudScript(req, res) {
    let startTime = Date.now();
    try {
        IS_DEV = true;
        req.body.PlayFabId = req.body.PlayFabId ?? extractPlayfabidFromToken(req.headers['x-authorization']);//doing this is faster than validating the ticket with the playfab api :P, it can fail obviously
        req.body.requestId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        pendingResponses[req.body.requestId] = res;
        wsClient.send(JSON.stringify({ type: 'request', data: req.body }));
    }
    catch (e) {
        compiler.transformErrorStack(e, directory);
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
global.__convertAndLogTrace = function (data) {
    try {
        let dummy = new Error("dummy");//doing this to get the stack
        compiler.transformErrorStack(dummy, directory);
        let stackLines = dummy.stack.split('\n');
        stackLines.splice(0, 4);
        data.Stack = stackLines.join('\n');
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
function listenMonitor() {
    let exitTimeout = null;
    function exitProgram() {
        process.exit();
    }
    process.stdin.on('data', (data) => {
        if (exitTimeout != null)
            clearTimeout(exitTimeout);
        exitTimeout = setTimeout(exitProgram, 15000);
    });
}
listenMonitor();