const compilerUtils = require('./compilerUtils');
const fs = require('fs');
const path = require('path');
const UglifyJS = require("uglify-js");
const { Project, SyntaxKind, CallExpression } = require('ts-morph');



/**
 * Compiles and combines all valid JavaScript and TypeScript files in the specified directory into a single output file.
 * 
 * @param {string} location - The root directory to search for files to compile.
 */
module.exports.compile = (location) => {
    let files = compilerUtils.getFiles(location);

    let outFile = "";
    outFile += `const _=()=>{};\n`;
    for (let file of files) {
        let content = compilerUtils.processFile(file);
        // content = replaceConsoleLogs(content);
        outFile += content;
        outFile += '\n';
    }
    let minified = UglifyJS.minify(outFile, { compress: true });
    if (minified.error)
        throw new Error(minified.error);
    return minified.code;
}
function replaceConsoleLogs(content, target = "_()") {
    if (!content.includes("console.log("))
        return content;

    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("temp.ts", content, { overwrite: true });

    // SAFELY collect nodes before modifying
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter(call => call.getExpression().getText() === "console.log");

    for (const call of calls) {
        call.replaceWithText(target);
    }

    return sourceFile.getFullText();
}
