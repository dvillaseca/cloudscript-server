
const loop = require('deasync').loopWhile;
const PlayFab = require('playfab-sdk').PlayFab;
const apiMethods = require('./api-methods.json').server;
const PlayFabApiError = require('./playfab-api-error');

function callApiMethod(request, method) {
    __playfab_internal.apiCallCount++;
    let error = null;
    let response = null;
    PlayFab.MakeRequest(
        PlayFab.GetServerUrl() + "/Server/" + method,
        request,
        "X-SecretKey",
        PlayFab.settings.developerSecretKey,
        (err, result) => {
            error = err;
            response = result?.data;
        },
    );
    loop(() => error == null && response == null);
    if (error != null) {
        throw new PlayFabApiError(error.error, error);
    }
    return response;
};

for (let method of apiMethods) {
    module.exports[method] = (req) => callApiMethod(req, method);
}