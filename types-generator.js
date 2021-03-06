
const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

function getFiles(location) {
    return fs.readdirSync(location)
        .filter(file => file.indexOf('.') != 0 && file.includes('.js'))
        .map(file => path.join(location, file));
}

module.exports = (directory) => {
    console.log('generating typings');
    let files = getFiles(directory);
    let added = [];
    for (let file of files) {
        try {
            spawnSync(process.execPath, [path.join(__dirname, 'node_modules/typescript/lib/tsc.js'), file, '--noResolve', '--declaration', '--allowJs', '--emitDeclarationOnly', '--outDir', path.join(directory, 'typings/autogenerated/scripts')]);
            let filename = path.basename(file);
            added.push('scripts/' + filename.substring(0, filename.length - 3) + '.d.ts');
        }
        catch (e) {
            console.error(e);
        }
    }
    try {
        fs.writeFileSync(path.join(directory, 'typings/autogenerated/index.d.ts'), added.map(a => `/// <reference path="${a}" />`).join('\n'));
        console.log(`add this to your references: /// <reference path="typings/autogenerated/index.d.ts" />`)
    }
    catch (e) {
        console.error(e);
    }
} 