import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTest = process.env.NODE_ENV === "test";
const isDev = process.env.NODE_ENV !== "production";

const baseOpts = {
    level: process.env.LOG_LEVEL || (isTest ? "silent" : "info"),
    service: "mindful-learning-api",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level(label) {
            return { level: label };
        },
    },
};

let logger;

if (isTest) {
    logger = pino({ ...baseOpts, level: "silent" });
} else if (isDev) {
    logger = pino(baseOpts).child({});
    // Use pino-pretty for dev via transport
    const transport = pino.transport({
        targets: [
            {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname,service",
                },
                level: baseOpts.level,
            },
        ],
    });
    logger = pino(baseOpts, transport);
} else {
    // Production: write to files (JSON)
    const logDir = path.join(__dirname, "../../logs");
    const transport = pino.transport({
        targets: [
            {
                target: "pino/file",
                options: { destination: path.join(logDir, "error.log"), mkdir: true },
                level: "error",
            },
            {
                target: "pino/file",
                options: { destination: path.join(logDir, "combined.log"), mkdir: true },
                level: baseOpts.level,
            },
        ],
    });
    logger = pino(baseOpts, transport);
}

export default logger;
