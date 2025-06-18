const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const ignore = require('ignore');
const crypto = require('crypto');



// This will be your persistent cache directory
const CACHE_DIR = path.join(__dirname, '..', '..', 'processed-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(path.join(CACHE_DIR, "files"), { recursive: true });

// Capture self mtime once
const SELF_FILE = __filename;
const SELF_MTIME = fs.statSync(SELF_FILE).mtimeMs;

function clearCache() {
    fs.rmSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(path.join(CACHE_DIR, "files"), { recursive: true });
}

function hashDirectory(directory) {
    return crypto.createHash('md5').update(directory).digest('hex');
}

function loadCache(directory) {
    const hash = hashDirectory(directory);
    const cachePath = path.join(CACHE_DIR, `${hash}.cache.json`);

    if (!fs.existsSync(cachePath)) {
        return { cache: {}, path: cachePath };
    }

    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return { cache, path: cachePath };
}

function saveCache(cache, cachePath) {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function processFileWithCache(filePath, rootDirectory, cacheToUse) {

    let { cache, path: cachePath } = cacheToUse;
    const relativePath = path.relative(rootDirectory, filePath).replace(/\\/g, '/');
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;

    if (cache[relativePath]
        && cache[relativePath].mtime === mtime
        && cache[relativePath].processorMtime === SELF_MTIME) {

        const cachedOutputPath = path.join(CACHE_DIR, "files", cache[relativePath].outputFile);
        if (fs.existsSync(cachedOutputPath)) {
            const cachedOutput = fs.readFileSync(cachedOutputPath, 'utf8');

            return cachedOutput;
        }
    }

    // File needs to be processed
    const processedCode = processFile(filePath);

    // Save processed output to disk
    const outputFile = `${hashDirectory(relativePath)}.compiled.js`;
    const outputFilePath = path.join(CACHE_DIR, "files", outputFile);
    fs.writeFileSync(outputFilePath, processedCode);

    // Update cache entry
    cache[relativePath] = {
        mtime,
        processorMtime: SELF_MTIME,
        outputFile
    };

    return processedCode;
}





/**
 * Reads and processes a JavaScript or TypeScript file. This will return a plain JS code that can be used in the cloudscript.
 * 
 * - If the file is a TypeScript (.ts) file, it transpiles it to JavaScript using esbuild in IIFE format,
 *   then removes the IIFE wrapper.
 * - Removes all import statements.
 * - Removes all 'require' statements, both assigned and standalone.
 * 
 * @param {string} filePath - The path to the file to process.
 * @returns {string} The cleaned and processed JavaScript code as a string.
 */
function processFile(filePath) {
    let code = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);


    // If the file is a .ts file, we need to transpile it to plain JS
    if (ext === '.ts') {

        const typescriptbuild = esbuild.transformSync(code, { loader: "ts", format: "iife", "sourcemap": "external", "sourcefile": filePath });
        code = typescriptbuild.code;
        code = removeIIFEWrapper(code);
        //Save the source map to a file inside "maps" folder
        //maps folder might not exist, so we need to create it
        if (!fs.existsSync(path.join(__dirname, "..", "..", 'maps')))
            fs.mkdirSync(path.join(__dirname, "..", "..", 'maps'));
        fs.writeFileSync(path.join(__dirname, "..", "..", 'maps', path.basename(filePath) + '.map'), typescriptbuild.map);

        return code;
    }

    return removeImports(code);
}



/**
 * Removes the IIFE (Immediately Invoked Function Expression) wrapper from the given code.
 * Also removes (by commenting) 'require' statements and their associated variables.
 * Additionally, unwraps the variable usage directly in the code.
 * 
 * Example input:
 * (() => {
 *   var import_playfab = require('typings/playfab/index.d.ts');
 *   var import_node = require('typings/node/index.d.ts');
 *   console.log(import_playfab.currentPlayerId);
 *   require('fs');
 * })();
 * 
 * Example output:
 * /* (() => { *\/
 * /* var import_playfab = require('typings/playfab/index.d.ts'); *\/
 * /* var import_node = require('typings/node/index.d.ts'); *\/
 * console.log(currentPlayerId);
 * /* require('fs'); *\/
 * /* })(); *\/
 * 
 * In summary:
 * - Comments out the IIFE wrapper instead of removing it.
 * - Comments out all 'require' statements.
 * - Collects variables assigned from 'require' and removes their usage prefix (e.g. 'import_playfab.').
 * - Keeps all lines intact to preserve line numbers for debugging.
 * 
 * @param {string} code - The code string to process.
 * @returns {string} The cleaned code with commented IIFE and 'require' statements, and unwrapped variables.
 */
function removeIIFEWrapper(code) {
    // Safely comment out the IIFE start
    code = code.replace(/^\s*\(\(\s*\)\s*=>\s*{\s*$/m, match => `/* ${match} */`);

    // Safely comment out the IIFE end
    code = code.replace(/^\s*}\s*\)\(\);\s*$/m, match => `/* ${match} */`);

    // Collect variables to replace
    let variableNames = [];

    // Comment require assignments like: var foo = require('...');
    code = code.replace(/^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*require\(.*\);?/gm, (match, varName) => {
        variableNames.push(varName);
        return `/* ${match} */`;
    });

    // Comment standalone require calls
    code = code.replace(/^\s*require\(.*\);?/gm, match => `/* ${match} */`);

    // Replace variableName. usages
    for (let varName of variableNames) {
        const regex = new RegExp(varName + '\\.', 'g');
        code = code.replace(regex, '');
    }

    return code;
}





function removeImports(code) {
    // Match multiline imports
    code = code.replace(/(^|\n)(\s*import[\s\S]*?from\s+['"][^'"]+['"]\s*;?)/g, (match, prefix, statement) => {
        return `${prefix}/*${statement} */`;
    });

    // Match multiline requires
    code = code.replace(/(^|\n)(\s*(const|let|var)[\s\S]*?=\s*require\(.*?\)\s*;?)/g, (match, prefix, statement) => {
        return `${prefix}/*${statement} */`;
    });

    // Match standalone requires
    code = code.replace(/(^|\n)(\s*require\(.*?\)\s*;?)/g, (match, prefix, statement) => {
        return `${prefix}/*${statement} */`;
    });

    return code;
}


/**
 * Recursively retrieves all JavaScript (.js) and TypeScript (.ts) files from the given directory,
 * excluding files and folders based on a .cloudscriptignore file if present, or using default ignore rules.
 *  * 
 * @param {string} location - The root directory to start searching for files.
 * @param {string} [defaultIgnores='\nnode_modules\ntypings\n'] - Additional default ignore patterns.
 * @param {string} [ignoreFile='.cloudscriptignore'] - The name of the ignore file.
 * @returns {string[]} An array of full file paths for valid JavaScript and TypeScript files.
 */

function getFiles(location, defaultIgnores = `\nnode_modules\ntypings\n`, ignoreFile = `.cloudscriptignore`) {
    let allFiles = [];
    let ig;

    //Check if there is a .cloudscriptignore file
    let ignoreFileContent = ``;
    if (fs.existsSync(path.join(location, ignoreFile)))
        ignoreFileContent = fs.readFileSync(path.join(location, ignoreFile), 'utf8');
    ignoreFileContent += defaultIgnores;
    if (ignoreFileContent != null && ignoreFileContent.length > 0)
        ig = ignore().add(ignoreFileContent);

    function traverseDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(location, fullPath);

            if (entry.isDirectory()) {
                if (!ig || !ig.ignores(relativePath)) {
                    traverseDir(fullPath);
                }
                continue;
            }

            const ext = path.extname(entry.name);

            let isIgnored = ig != null && ig.ignores(relativePath);
            let isValidTsOrJs = ['.js', '.ts'].includes(ext);
            if (!isIgnored && isValidTsOrJs) {
                allFiles.push(fullPath);
            }
        }
    }

    traverseDir(location);
    return allFiles;
}



const fileProcessorCache = {
    loadCache,
    saveCache,
    clearCache
}


const compilerUtils = {
    processFile,
    processFileWithCache,
    removeIIFEWrapper,
    getFiles,
    clearCache,
    fileProcessorCache
}

module.exports = compilerUtils;