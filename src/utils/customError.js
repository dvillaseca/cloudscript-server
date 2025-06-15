const { colorJSONStringify } = require('./utils');

var ErrorHelper;
const colors = require('colors');
(function (ErrorHelper) {
    function toStrippedError(error) {
        if (isCustomStrippedError(error))
            return error;
        if (CustomError.isCustomError(error)) {
            return error.toStripped();
        }
        if (error instanceof Error) {
            return {
                code: error.name || "ERROR",
                message: error.message,
            };
        }
        return {
            code: "UNKNOWN_ERROR",
            message: typeof error === "object" ? JSON.stringify(error) : String(error),
        };
    }
    ErrorHelper.toStrippedError = toStrippedError;
    function isErrorData(error) {
        return (error != null &&
            typeof error === "object" &&
            typeof error.message === "string" &&
            (error.code == null || typeof error.code === "string") &&
            (error.stack == null || typeof error.stack === "string") &&
            (error.originalErrorObject == null ||
                typeof error.originalErrorObject === "object"));
    }
    ErrorHelper.isErrorData = isErrorData;
    function extractErrorData(error) {
        let errorData = {
            code: undefined,
            message: "",
            stack: undefined,
            originalErrorObject: null,
        };
        if (isCustomStrippedError(error)) {
            errorData.code = error.code;
            errorData.message = error.message;
            return errorData;
        }
        if (CustomError.isCustomError(error)) {
            errorData.code = error.code;
            errorData.message = error.message;
            errorData.stack = error.stack;
            errorData.originalErrorObject = error;
            return errorData;
        }
        if (error instanceof Error) {
            errorData.code = error.name;
            errorData.message = error.message;
            errorData.stack = error.stack;
            errorData.originalErrorObject = error;
            return errorData;
        }
        if (typeof error === "object") {
            errorData.code = error.code;
            errorData.message = JSON.stringify(error, null, 2);
            errorData.stack = error.stack;
            errorData.originalErrorObject = error;
            return errorData;
        }
        errorData.code = undefined;
        errorData.message = String(error);
        errorData.stack = undefined;
        errorData.originalErrorObject = null;
        return errorData;
    }
    ErrorHelper.extractErrorData = extractErrorData;
    function format(error) {
        let errorData = isErrorData(error) ? error : extractErrorData(error);
        if (errorData.code != undefined)
            return `${errorData.code}: ${errorData.message}`;
        if (errorData.originalErrorObject != null &&
            typeof errorData.originalErrorObject === "object" &&
            !(errorData instanceof Error))
            return `${JSON.stringify(errorData.originalErrorObject, null, 2)}`;
        return errorData.message;
    }
    ErrorHelper.format = format;
    function formatWithStack(error) {
        const errorData = extractErrorData(error);
        let formatted = format(errorData);
        let stack = "";
        if (errorData.stack)
            stack = `${errorData.stack}`;
        if (stack.startsWith(formatted))
            stack = stack.substring(formatted.length);
        if (stack.startsWith("\n"))
            stack = stack.substring(1);
        formatted = `${formatted}\n${stack}`;
        if (formatted.endsWith("\n"))
            formatted = formatted.substring(0, formatted.length - 1);
        return formatted;
    }
    ErrorHelper.formatWithStack = formatWithStack;
    function isCustomStrippedError(error) {
        if (error &&
            typeof error === "object" &&
            typeof error.code === "string" &&
            typeof error.message === "string") {
            const keys = Object.keys(error);
            return (keys.length === 2 && keys.includes("code") && keys.includes("message"));
        }
        return false;
    }
    ErrorHelper.isCustomStrippedError = isCustomStrippedError;
    function formatWithStackHeavy(error) {
        let errorData = extractErrorData(error);
        let stack = errorData.stack ?? "";
        let headerFormatted = format(errorData);
        if (stack.startsWith(headerFormatted))
            stack = stack.substring(headerFormatted.length);
        stack = colors.yellow(stack);
        stack = colors.italic(stack);
        let errorCode = errorData.code ?? "";
        if (errorCode != "") {
            errorCode = colors.bold(errorCode);
            errorCode = colors.italic(errorCode);
            errorCode = colors.underline(errorCode);
            errorCode = colors.red(errorCode);
            errorCode = `${errorCode} `;
        }
        let message = errorData.message;
        // message = colors.red(message);
        message = colors.white(message);
        // message = colors.dim(message);
        if (errorData.originalErrorObject != null &&
            typeof errorData.originalErrorObject === "object" &&
            !(errorData.originalErrorObject instanceof Error)) {
            message = `\n${colorJSONStringify(errorData.originalErrorObject)}`;
        }
        return `${errorCode}${message}${stack}`;
    }
    ErrorHelper.formatWithStackHeavy = formatWithStackHeavy;
})(ErrorHelper || (ErrorHelper = {}));

class CustomError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = code;
        Error.captureStackTrace?.(this, new.target);
    }
    toString() {
        return ErrorHelper.formatWithStack(this);
    }
    toStripped() {
        return {
            code: this.code,
            message: this.message,
        };
    }
    static isCustomError(error) {
        return error instanceof CustomError;
    }
}


module.exports = {
    CustomError,
    ErrorHelper
}