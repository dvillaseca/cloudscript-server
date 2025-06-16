const colors = require('colors');

function colorJSONStringify(obj, indent = 2) {
    const json = JSON.stringify(obj, null, indent);

    return json.replace(
        /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\d+)/g,
        (match) => {
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    return colors.cyan(match); // key
                }
                return colors.green(match); // string value
            }
            if (/true|false/.test(match)) {
                return colors.yellow(match);
            }
            if (/null/.test(match)) {
                return colors.gray(match);
            }
            return colors.magenta(match); // number
        }
    );
}


function formatDateSimple(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}




module.exports = {
    colorJSONStringify,
    formatDateSimple
}
