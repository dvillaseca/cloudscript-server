
require('colors');
const express = require('express');
const axios = require('axios').default;
const compiler = require('./compiler.js');

const directory = process.argv[3];
require('dotenv').config({ path: require('path').join(directory, './.env') });

if (process.env['TITLE_ID'] == null) {
    console.log('missing environment variable TITLE_ID'.red);
    process.exit();
}
if (process.env['TITLE_SECRET'] == null) {
    console.log('missing environment variable TITLE_SECRET'.red);
    process.exit();
}

const titleId = process.env['TITLE_ID'];
let serverEntityTokenExpiration = null;

let cloudscript = null;
try {
    cloudscript = require('./cloudscript.js');
}
catch (e) {
    compiler.transformErrorStack(e, directory);
    logError(e);
    process.exit();
}
async function executeCloudScript(req, res) {
    let startTime = Date.now();
    try {
        currentPlayerId = req.body.PlayFabId ?? req.headers['x-authorization'].split('--')[0];//doing this is faster than validating the ticket with the playfab api :P, it can fail obviously
        __playfab_internal.apiRequestCount = 0;
        __playfab_internal.httpRequestCount = 0;
        __playfab_internal.logs = [];

        if (cloudscript[req.body.FunctionName] == null)
            return res.json(generateResponse(200, 'OK', req.body.FunctionName, null, (Date.now() - startTime) * 0.001, {
                Error: "CloudScriptNotFound", Message: `No function named ${req.body.FunctionName} was found to execute`, StackTrace: ""
            }));

        let result = cloudscript[req.body.FunctionName](req.body.FunctionParameter, { playerProfile: null, playStreamEvent: null, triggeredByTask: null });
        return res.json(generateResponse(200, 'OK', req.body.FunctionName, result, (Date.now() - startTime) * 0.001));
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
            APIRequestsIssued: __playfab_internal.apiCallCount,
            HttpRequestsIssued: __playfab_internal.httpRequestCount,
            ExecutionTimeSeconds,
            Logs: __playfab_internal.logs,
            Error
        }
    };
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

async function setupServerEntityToken() {
    if (serverEntityTokenExpiration != null && Date.now() - serverEntityTokenExpiration > 60 * 60 * 1000) {
        setTimeout(setupServerEntityToken, 300000);
        return;
    }
    let playfab = require('playfab-sdk');
    let res = await require('util').promisify(playfab.PlayFabAuthentication.GetEntityToken)({});
    playfab.settings.entityToken = res.data.EntityToken;
    serverEntityTokenExpiration = Date.parse(res.data.TokenExpiration);
    setTimeout(setupServerEntityToken, 300000);
}

async function startServer() {
    let playfab = require('playfab-sdk');
    playfab.settings.titleId = process.env['TITLE_ID'];
    playfab.settings.developerSecretKey = process.env['TITLE_SECRET'];
    await setupServerEntityToken();
    let port = parseInt(process.argv[2]);
    app.listen(port);
    console.log(("Server started at port: " + port + "\n").green);
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