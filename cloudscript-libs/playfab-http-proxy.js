//Playfab only supports https requests, so if we use a custom local playfab server
//or a custom local playfab proxy server, we need to call the playfab api using http
//instead of https

const { PlayFab } = require("playfab-sdk");
const http = require('http');
const https = require('https');
var url = require("url");


function optionalValue(value) {
    if (value == null)
        return null;
    let trimmed = String(value).trim();
    return trimmed.length === 0 ? null : trimmed;
}

/**
 * Reads the PlayFab host overrides from the cloudscript project environment.
 * A blank value is treated as unset.
 */
function readPlayfabEnvironment(env) {
    env = env ?? process.env;
    return {
        titleId: env['TITLE_ID'],
        developerSecretKey: env['TITLE_SECRET'],
        productionUrl: optionalValue(env['PLAYFAB_PRODUCTION_URL']),
        verticalName: optionalValue(env['PLAYFAB_VERTICAL_NAME']),
        port: optionalValue(env['PLAYFAB_PORT']),
    };
}

function applyPlayfabSettings(playfab, settings) {
    if (optionalValue(settings.titleId) != null)
        playfab.settings.titleId = optionalValue(settings.titleId);
    if (optionalValue(settings.developerSecretKey) != null)
        playfab.settings.developerSecretKey = optionalValue(settings.developerSecretKey);
    if (optionalValue(settings.productionUrl) != null)
        playfab.settings.productionUrl = optionalValue(settings.productionUrl);
    if (optionalValue(settings.port) != null)
        playfab.settings.port = parseInt(optionalValue(settings.port), 10);
    if (optionalValue(settings.verticalName) != null)
        playfab.settings.verticalName = optionalValue(settings.verticalName);
}

function applyPort(url, port) {
    if (port == null || String(port).trim() === '')
        return url;
    let parsed = new URL(url);
    if (parsed.port)
        return url;
    parsed.port = String(port).trim();
    let result = parsed.toString();
    if (result.endsWith('/') && !url.endsWith('/'))
        result = result.slice(0, -1);
    return result;
}

/**
 * @param {PlayFabModule.IPlayFabSettings} playfabSettings
 * @returns {string}
 */
function getPlayfabUrl(playfabSettings) {
    let baseUrl = optionalValue(playfabSettings.productionUrl) ?? `.playfabapi.com`;
    let resolved;
    if (!(baseUrl.substring(0, 4) === `http`)) {
        if (playfabSettings.verticalName)
            resolved = `https://${playfabSettings.verticalName}${baseUrl}`;
        else resolved = `https://${playfabSettings.titleId}${baseUrl}`;
    } else {
        resolved = baseUrl;
    }
    return applyPort(resolved, playfabSettings.port);
}



function patchPlayfabMakeRequest(){
    PlayFab.MakeRequest = function(urlStr, request, authType, authValue, callback){
        if (urlStr.startsWith("http://")) {
            makeHttpRequest(urlStr, request, authType, authValue, callback)
            return;
        }
        makeHttpsRequest(urlStr, request, authType, authValue, callback) 
    }
}



const makeHttpRequest = function (urlStr, request, authType, authValue, callback) {
    if (request == null) {
        request = {};
    }
    var requestBody = Buffer.from(JSON.stringify(request), "utf8");

    var urlArr = [urlStr]; //make a new array for the URL
    var getParams = PlayFab._internalSettings.requestGetParams;
    if (getParams != null) {
        var firstParam = true;
        for (var key in getParams) {
            if (firstParam) {
                urlArr.push("?");
                firstParam = false;
            } else {
                urlArr.push("&");
            }
            urlArr.push(key);
            urlArr.push("=");
            urlArr.push(getParams[key]);
        }
    }

    var completeUrl = urlArr.join("");

    var options = url.parse(completeUrl);
    
    options.method = "POST";
    options.port = options.port || PlayFab.settings.port;
    options.headers = {
        "Content-Type": "application/json",
        "Content-Length": requestBody.length,
        "X-PlayFabSDK": "NodeSDK-" + PlayFab.sdk_version + "-" + PlayFab.api_version,
    };

    if (authType) {
        options.headers[authType] = authValue;
    }
    
    //If using a proxy, the sever is always expecting the SecretKey, so we need to add it to the headers
    //even if the authType is not "X-SecretKey"
    options.headers["X-SecretKey"] = PlayFab.settings.developerSecretKey;

    var postReq = http.request(options, function (res) {
        var rawReply = "";
        res.setEncoding("utf8");
        res.on("data", function (chunk) {
            rawReply += chunk;
        });
        res.on("end", function () {
            if (callback == null) {
                return; // No need to bother decoding results
            }

            var replyEnvelope = null;
            try {
                replyEnvelope = JSON.parse(rawReply);
            } catch (e) {
                // Handle when rawReply is not valid json
                replyEnvelope = {
                    code: 503, // Service Unavailable
                    status: "Service Unavailable",
                    error: "Connection error",
                    errorCode: 2, // PlayFabErrorCode.ConnectionError
                    errorMessage: rawReply,
                };
            }

            if (replyEnvelope.hasOwnProperty("error") || !replyEnvelope.hasOwnProperty("data")) {
                callback(replyEnvelope, null);
            } else {
                callback(null, replyEnvelope);
            }
        });
    });

    postReq.on("error", function (e) {
        if (callback == null) {
            return; // No need to bother decoding results
        }

        callback(
            {
                code: 503, // Service Unavailable
                status: "Service Unavailable",
                error: "Connection error",
                errorCode: 2, // PlayFabErrorCode.ConnectionError
                errorMessage: e.message,
            },
            null,
        );
    });

    postReq.write(requestBody);
    postReq.end();
};



const makeHttpsRequest = function (urlStr, request, authType, authValue, callback) {
    if (request == null) {
        request = {};
    }
    var requestBody = Buffer.from(JSON.stringify(request), "utf8");

    var urlArr = [urlStr]; //make a new array for the URL
    var getParams = PlayFab._internalSettings.requestGetParams;
    if (getParams != null) {
        var firstParam = true;
        for (var key in getParams) {
            if (firstParam) {
                urlArr.push("?");
                firstParam = false;
            } else {
                urlArr.push("&");
            }
            urlArr.push(key);
            urlArr.push("=");
            urlArr.push(getParams[key]);
        }
    }

    var completeUrl = urlArr.join("");

    var options = url.parse(completeUrl);
    if (options.protocol !== "https:") {
        throw new Error("Unsupported protocol: " + options.protocol);
    }
    options.method = "POST";
    options.port = options.port || PlayFab.settings.port;
    options.headers = {
        "Content-Type": "application/json",
        "Content-Length": requestBody.length,
        "X-PlayFabSDK": "NodeSDK-" + PlayFab.sdk_version + "-" + PlayFab.api_version,
    };

    if (authType) {
        options.headers[authType] = authValue;
    }

    //If using a proxy, the sever is always expecting the SecretKey
    //so we need to add it to the headers always, even if the authType is not "X-SecretKey"
    options.headers["X-SecretKey"] = PlayFab.settings.developerSecretKey;

    var postReq = https.request(options, function (res) {
        var rawReply = "";
        res.setEncoding("utf8");
        res.on("data", function (chunk) {
            rawReply += chunk;
        });
        res.on("end", function () {
            if (callback == null) {
                return; // No need to bother decoding results
            }

            var replyEnvelope = null;
            try {
                replyEnvelope = JSON.parse(rawReply);
            } catch (e) {
                // Handle when rawReply is not valid json
                replyEnvelope = {
                    code: 503, // Service Unavailable
                    status: "Service Unavailable",
                    error: "Connection error",
                    errorCode: 2, // PlayFabErrorCode.ConnectionError
                    errorMessage: rawReply,
                };
            }

            if (replyEnvelope.hasOwnProperty("error") || !replyEnvelope.hasOwnProperty("data")) {
                callback(replyEnvelope, null);
            } else {
                callback(null, replyEnvelope);
            }
        });
    });

    postReq.on("error", function (e) {
        if (callback == null) {
            return; // No need to bother decoding results
        }

        callback(
            {
                code: 503, // Service Unavailable
                status: "Service Unavailable",
                error: "Connection error",
                errorCode: 2, // PlayFabErrorCode.ConnectionError
                errorMessage: e.message,
            },
            null,
        );
    });

    postReq.write(requestBody);
    postReq.end();
};



module.exports = {
    HttpProxy: {
        makeHttpRequest,
    },
    getPlayfabUrl,
    readPlayfabEnvironment,
    applyPlayfabSettings,
    patchPlayfabMakeRequest
}