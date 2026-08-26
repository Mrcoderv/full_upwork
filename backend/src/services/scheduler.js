/**
 * Lightweight background scheduler (Etapp 2, P0).
 *
 * Runs the inactivity automation scan once per day at a configurable UTC hour
 * (INACTIVITY_SCAN_HOUR_UTC, default 02:00). No external dependency — a
 * self-rescheduling setTimeout avoids setInterval drift and gives us a clean
 * stop handle. A run-in-flight flag prevents overlapping scans (a slow scan
 * must never queue a second one on top of itself).
 *
 * Disabled entirely when:
 *   - NODE_ENV === "test" (tests trigger the scan directly)
 *   - INACTIVITY_AUTO_WARNING_ENABLED === "false"
 */
import logger from "../utils/logger.js";
import { runInactivityScan } from "./inactivityScanner.js";
import { runDiplomaNotificationScan } from "./diplomaNotificationScan.js";

const SCAN_HOUR_UTC = (() => {
    const raw = parseInt(process.env.INACTIVITY_SCAN_HOUR_UTC, 10);
    return Number.isFinite(raw) && raw >= 0 && raw <= 23 ? raw : 2;
})();

const DAY_MS = 24 * 60 * 60 * 1000;

let timer = null;
let running = false;
let started = false;

const msUntilNextScan = () => {
    const now = new Date();
    const next = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCAN_HOUR_UTC, 0, 0, 0)
    );
    if (next.getTime() <= now.getTime()) {
        next.setTime(next.getTime() + DAY_MS);
    }
    return next.getTime() - now.getTime();
};

const executeScan = async () => {
    if (running) {
        logger.warn("Inactivity scan skipped — previous scan still running");
        return;
    }
    running = true;
    try {
        const summary = await runInactivityScan();
        logger.info(
            { summary },
            "Scheduled inactivity scan completed"
        );
        try {
            const diplomaSummary = await runDiplomaNotificationScan();
            logger.info({ summary: diplomaSummary }, "Diploma notification scan completed");
        } catch (err) {
            logger.error({ err }, "Diploma notification scan failed");
        }
    } catch (error) {
        logger.error({ err: error }, "Scheduled inactivity scan failed");
    } finally {
        running = false;
    }
};

const scheduleNext = () => {
    const delay = msUntilNextScan();
    timer = setTimeout(() => {
        executeScan();
        scheduleNext();
    }, delay);
    timer.unref?.();
    logger.info(
        { nextRunAt: new Date(Date.now() + delay).toISOString(), hourUtc: SCAN_HOUR_UTC },
        "Inactivity scan scheduled"
    );
};

export const isSchedulerStarted = () => started;

/**
 * Start the daily inactivity scan. No-op when disabled (test mode or
 * automation explicitly off) or when already started.
 */
export const startInactivityScheduler = () => {
    if (started) return;
    if (process.env.NODE_ENV === "test") {
        logger.info("Inactivity scheduler skipped (test mode)");
        return;
    }
    if (process.env.INACTIVITY_AUTO_WARNING_ENABLED === "false") {
        logger.info("Inactivity scheduler skipped (INACTIVITY_AUTO_WARNING_ENABLED=false)");
        return;
    }
    started = true;
    scheduleNext();
};

/** Stop the daily scan and release the timer (used on graceful shutdown). */
export const stopInactivityScheduler = () => {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    started = false;
};
