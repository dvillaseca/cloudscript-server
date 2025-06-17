
const releaseCompiler = require('./releaseCompiler');
const fs = require('fs');
const path = require('path');

/**
 * Compiles and combines all valid JavaScript and TypeScript files in the specified directory into a single output file.
 * 
 * @param {string} location - The root directory to search for files to compile.
 */
module.exports.compile = (location) => {

    let minifiedCode = releaseCompiler.compile(location);

    minifiedCode = `
const server = require('./cloudscript-libs/playfab-server-sync.js');
const http = require('./cloudscript-libs/http-sync.js');
const entity = require('./cloudscript-libs/playfab-entity-sync.js');
const economy = require('./cloudscript-libs/playfab-economy-sync.js');
const multiplayer = require('./cloudscript-libs/playfab-multiplayer-sync.js');
require('./cloudscript-libs/global-variables.js')
let handlers = {};\n${minifiedCode}`;
    minifiedCode += '\nmodule.exports = {handlers};\n ';
    fs.writeFileSync(path.join(__dirname, "..", "..", './cloudscript.min.js'), minifiedCode);
    return minifiedCode;
}
