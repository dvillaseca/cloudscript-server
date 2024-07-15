const directory = process.argv[2];
require('dotenv').config({ path: require('path').join(directory, './.env') });

let serverEntityTokenExpiration = null;

let cloudscript = null;
try {
    cloudscript = require(process.argv[2]);
}
catch (e) {
    logError(e);
    process.exit();
}
function executeCloudScript(req) {
    let startTime = Date.now();
    try {
        IS_DEV = true;
        currentPlayerId = req.PlayFabId;
        __playfab_internal.apiRequestCount = 0;
        __playfab_internal.httpRequestCount = 0;
        __playfab_internal.logs = [];

        if (cloudscript[req.FunctionName] == null)
            return generateResponse(200, 'OK', req.FunctionName, null, (Date.now() - startTime) * 0.001, {
                Error: "CloudScriptNotFound", Message: `No function named ${req.FunctionName} was found to execute`, StackTrace: ""
            });

        let result = cloudscript[req.FunctionName](req.FunctionParameter, { playerProfile: null, playStreamEvent: null, triggeredByTask: null });
        return generateResponse(200, 'OK', req.FunctionName, result, (Date.now() - startTime) * 0.001);
    }
    catch (e) {
        logError(e);
        if (e.data?.code != null) {
            return e.data;
        }
        if (e.stack != null) {
            return generateResponse(200, 'OK', req.FunctionName, null, (Date.now() - startTime) * 0.001, {
                Error: "JavascriptException", Message: "JavascriptException", StackTrace: e.stack
            });
        }
        return { error: 'Unknown', code: 500 };
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
    playfab.settings.titleId = process.argv[3];
    playfab.settings.developerSecretKey = process.argv[4];
    await setupServerEntityToken();
}

//used by the global playfab log object
global.__convertAndLogTrace = function (data) {
    try {
        let dummy = new Error("dummy");//doing this to get the stack
        let stackLines = dummy.stack.split('\n');
        stackLines.splice(0, 4);
        data.Stack = stackLines.join('\n');
        console.log(JSON.stringify(data));
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
            console.error(JSON.stringify(e.data));
        console.log(e.stack);
    }
}
//listening if monitor is still controlling the process, if not, exit
function listenMonitor() {
    let exitTimeout = null;
    function exitProgram() {
        process.exit();
    }
    process.stdin.on('data', (data) => {
        try {
            let req = JSON.parse(data.toString());
            if (req.FunctionName != null) {
                let result = executeCloudScript(req);
                result.requestId = req.requestId;
              //  console.log(result);
                process.stdout.write(JSON.stringify(result));
            }
        }
        catch (e) {
            console.error(e);
        }
        if (exitTimeout != null)
            clearTimeout(exitTimeout);
        exitTimeout = setTimeout(exitProgram, 120000);
    });
}
listenMonitor();
startServer();