
const argv = require('minimist')(process.argv.slice(2));
const compiler = require('./compiler.js');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
require('colors');
let timeout = null;
let child = null;
let directory = null;

function stopServer() {
    if (child == null)
        return;
    console.log("Stopping server".red);
    child.kill('SIGINT');
    child = null;
}
function startServer() {
    timeout = null;

    stopServer();

    compiler.compile(directory);

    let port = argv.p ?? argv.port ?? 8080;
    let serverType = argv._.includes('remote') ? 'server-remote.js' : 'server.js';
    child = spawn(process.execPath, [path.join(__dirname, serverType), port, directory, '--color'], {
        detached: true,
        stdio: 'pipe'
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
}
function keepAliveChild() {
    if (child == null)
        return;
    child.stdin.write('1', (err) => { });
}
async function main() {
    directory = argv.dir ?? argv.d;
    if (directory != null && !path.isAbsolute(directory)) {
        directory = path.join(process.cwd(), directory);
    }
    else if (directory == null) {
        directory = process.cwd();
    }
    if (argv._.includes('typings')) {
        require('./types-generator.js')(directory);
        return;
    }
    if (argv._.includes('publish')) {
        await require('./publisher.js')(directory);
        return;
    }

    console.log(("Monitoring folder: " + directory + "\n").yellow);

    fs.watch(directory, (eventType, filename) => {
        let extension = path.extname(filename);
        if (extension != '.js' && extension != '.ts' && !filename.includes('.env'))
            return;
        if (timeout != null) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(startServer, 500);
    });

    process.on('SIGINT', () => {
        stopServer();
        process.exit();
    });
    process.on('exit', stopServer);
    startServer();
    setInterval(keepAliveChild, 5000);
}
main();