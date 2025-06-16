const compilerUtils = require('./compilerUtils');
const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('@jridgewell/source-map');


/**
 * Compiles and combines all valid JavaScript and TypeScript files in the specified directory into a single output file.
 * 
 * - Searches for all files using `getFiles`.
 * - If a file named "ServerUtils.ts" exists, it will be processed first.
 * - Prepends required PlayFab and library dependencies to the output.
 * - Processes each file's content with `processFile` to clean and prepare it.
 * - Writes the final combined code to `cloudscript.js` in the current directory.
 * 
 * @param {string} location - The root directory to search for files to compile.
 */
module.exports.compile = (location) => {

    let files = compilerUtils.getFiles(location);

    //ServerUtils.ts is a special file that is used to have a callback to when the server is ready
    //so we need to compile it first
    let serverUtilsIndex = files.findIndex(it => it.includes('ServerUtils.ts'));
    if (serverUtilsIndex != -1) {
        let serverUtils = files.splice(serverUtilsIndex, 1)[0];
        files.unshift(serverUtils);
    }

    //Replace console.error with ServerUtils.logError
    let replaceLogError = `
const globalConsole = require('console');
const console = { ...globalConsole };
function setConsoleErrorHook(customErrorHook) {
    console.error = (...args) => customErrorHook(...args);
}

function setConsoleLogHook(customLogHook) {
    console.log = (...args) => customLogHook(...args);
}
`;
    let replaceLogErrorBack = ``;



    let outFile = `
const server = require('./cloudscript-libs/playfab-server-sync.js');
const http = require('./cloudscript-libs/http-sync.js');
const entity = require('./cloudscript-libs/playfab-entity-sync.js');
const economy = require('./cloudscript-libs/playfab-economy-sync.js');
const multiplayer = require('./cloudscript-libs/playfab-multiplayer-sync.js');
require('./cloudscript-libs/global-variables.js')
let handlers = {};\n`

    outFile += replaceLogError + '\n';


    for (let file of files) {
        let content = "\n" + getMarker(file) + '\n';
        content += compilerUtils.processFile(file, path.extname(file));
        outFile += content;
        outFile += '\n';
    }
    outFile += `IS_DEVELOPMENT=true;\n`;
    outFile += `${replaceLogErrorBack}\n`;
    if (serverUtilsIndex != -1)
        outFile += 'module.exports = {handlers,ServerUtilsInternal,setConsoleErrorHook,setConsoleLogHook};\n';
    else
        outFile += 'module.exports = {handlers,setConsoleErrorHook,setConsoleLogHook};\n ';

    fs.writeFileSync(path.join(__dirname, "..", "..", './cloudscript.js'), outFile);
}


/**
 * Returns a marker string that can be used to identify the original file of a line of code.
 * @param {String} fileName - The name of the file that the line of code is from.
 * @returns {String} A marker string that can be used to identify the original file of a line of code.
 */
const getMarker = (fileName) => {
    return `/***  ORIGINAL_CLOUDSCRIPT_FILE:  (${fileName})   ***/`;
}

/**
 * Checks if a line of code is a marker.
 * @param {string} line
 * @returns {boolean} True if the line is a marker, false otherwise.
 */
const isMarker = (line) => {
    line = line.trim();
    return line.startsWith('/***  ORIGINAL_CLOUDSCRIPT_FILE:  (') && line.endsWith(")   ***/");
}

const getOriginalFileName = (line) => {
    if (!isMarker(line))
        return null;
    line = line.trim();
    return line.split('ORIGINAL_CLOUDSCRIPT_FILE:  (')[1].split(')')[0];
}



/**
 * Returns the original file and line number of a line of code that was compiled.
 * @param {number} lineIndex - The line number of the line of code that was compiled.
 * @param {string} location - The location of the project.
 * @returns {string} The original file and line number of the line of code that was compiled.
 */
function getOriginalFileLine(lineIndex, location) {

    try {
        if (isNaN(lineIndex))
            return null;

        let files = compilerUtils.getFiles(location);
        //Load the cloudscript.js file, go to the originalLine position, and go up until we find a marker
        //or we reach the top of the file
        let content = fs.readFileSync(path.join(__dirname, "..", "..", './cloudscript.js'), 'utf-8');
        let lines = content.match(/[^\r\n]*\r?\n?/g);

        let file = null;
        let markerPosition = 0;
        for (let i = lineIndex; i >= 0; i--) {
            if (lineIndex >= lines.length)
                continue;
            if (isMarker(lines[i])) {
                file = getOriginalFileName(lines[i]);
                markerPosition = i;
                break;
            }
        }

        if (file == null)
            return null;

        //Now get how many lines were removed from the file, when we compiled it
        //Find all the lines in the file that starts with 
        // let removedLines = compilerUtils.countLinesToRemove(file);
        let lineDiff = lineIndex - markerPosition;

        // console.log(`${file}: ${removedLines} = ${lineDiff}`);

        //but if the file is typescript we might need to do a little bit more work
        if (path.extname(file) == '.ts') {
            const rawMap = JSON.parse(
                fs.readFileSync(path.join(__dirname, "..", "..", 'maps', path.basename(file) + '.map'), 'utf-8')
            )

            const consumer = new SourceMapConsumer(rawMap);
            const pos = consumer.originalPositionFor({
                line: lineDiff,
                column: 0
            });
            consumer.destroy();

            if (pos.line == null) {
                let content = fs.readFileSync(file, 'utf-8');
                let lines = content.match(/[^\r\n]*\r?\n?/g);
                pos.line = lines.length;

            }
            lineDiff = pos.line;
        }

        return file + ':' + (lineDiff);
    } catch {
        return null;
    }
}

module.exports.transformErrorStack = (error, location) => {

    if (typeof error?.stack != 'string')
        return;
    let stack = error.stack;
    let cloudscriptFile = path.join(__dirname, "..", "..", './cloudscript.js');
    let pos = 0;
    let modified = false;
    while (true) {
        let index = stack.indexOf(cloudscriptFile, pos);
        if (index == -1)
            break;
        pos = index + 1;
        let fileEndIndex = index + cloudscriptFile.length;
        let nextColon = stack.indexOf(':', fileEndIndex + 1);
        let nextLine = stack.indexOf('\n', fileEndIndex + 1);
        let lineDefinitionEnd = Math.min(nextColon == -1 ? 100000000 : nextColon, nextLine == -1 ? 100000000 : nextLine);
        let originalLine = getOriginalFileLine(parseInt(stack.substring(fileEndIndex + 1, lineDefinitionEnd)) - 1, location);

        if (originalLine != null) {
            stack = stack.slice(0, index) + originalLine + stack.slice(lineDefinitionEnd);
            pos += originalLine.length;
            modified = true;
        }
    }
    //clear every internal file from the stack
    if (modified)
        stack = stack.split('\n').filter(line => !line.includes(__dirname) && !line.includes('internal/modules/cjs/')).join('\n');
    error.stack = stack;
}