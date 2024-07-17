const axios = require('axios').default;
const loop = require('deasync').loopWhile;

module.exports.request = (url, method, contentBody, contentType, headers) => {
    __playfab_internal.httpRequestCount++;
    headers = headers ?? {};
    headers['content-type'] = contentType;
    let req = {
        method,
        url,
        data: contentType.includes('json') ? JSON.parse(contentBody) : contentBody,
        headers,
        timeout: 10000
    }
    let response = null;
    let error = null;
    axios(req)
        .then(res => {
            response = res.data;
            //cloudscript is specting a string so...            
            if (typeof response != 'string') {
                try {
                    response = JSON.stringify(response);
                }
                catch (e) {

                }
            }
        })
        .catch(e => {
            error = e;
        });

    loop(() => error == null && response == null);
    if (error != null)
        throw error;
    return response;
}