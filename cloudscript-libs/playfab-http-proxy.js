//Playfab only supports https requests, so if we use a custom local playfab server
//or a custom local playfab proxy server, we need to call the playfab api using http
//instead of https

const { PlayFab } = require("playfab-sdk");
const http = require('http');
const https = require('https');
var url = require("url");


/**
 * 
 * @param {PlayFabModule.IPlayFabSettings} playfabSettings 
 * @returns 
 */
function getPlayfabUrl(playfabSettings) {
    let baseUrl = playfabSettings.productionUrl ?? `.playfabapi.com`;
    if (!(baseUrl.substring(0, 4) === `http`)) {
        if (playfabSettings.verticalName)
            return `https://${playfabSettings.verticalName}${baseUrl}`;
        else return `https://${playfabSettings.titleId}${baseUrl}`;
    }
    return baseUrl;

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
    patchPlayfabMakeRequest
}