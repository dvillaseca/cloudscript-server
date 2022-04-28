

const playfab = require('playfab-sdk');
const compiler = require('./compiler.js');
function UpdateCloudscript(args) {
    return new Promise((resolve, reject) => {
        playfab.PlayFabAdmin.UpdateCloudScript(args, (err, res) => {
            if (err)
                return reject(err);
            resolve(res.data);
        });
    })
}
module.exports = async (directory) => {
    require('dotenv').config({ path: require('path').join(directory, './.env') });
    playfab.settings.titleId = process.env['TITLE_ID'];
    playfab.settings.developerSecretKey = process.env['TITLE_SECRET'];
    console.log("compiling...");
    let minified = compiler.compileRelease(directory);
    console.log("publishing...");
    let response = await UpdateCloudscript({
        Files: [{
            FileContents: minified,
            FileName: 'cloudscript.min.js'
        }]
    });
    console.log("published revision: " + response.Revision);
}