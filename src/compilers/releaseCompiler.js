const compilerUtils = require('./compilerUtils');
const fs = require('fs');
const path = require('path');
const UglifyJS = require("uglify-js");



/**
 * Compiles and combines all valid JavaScript and TypeScript files in the specified directory into a single output file.
 * 
 * @param {string} location - The root directory to search for files to compile.
 */
module.exports.compile = (location) => {
    let files = compilerUtils.getFiles(location);

    let outFile = "";
    for (let file of files) {
        outFile += compilerUtils.processFile(file);
        outFile += '\n';
    }
    let minified = UglifyJS.minify(outFile, { compress: true });
    if (minified.error)
        throw new Error(minified.error);
    return minified.code;
}
