import { startApi } from "@/app/api/api";
import { log } from "@/utils/log";
import { awaitShutdown, onShutdown } from "@/utils/shutdown";
import { db } from './storage/db';
import { startTimeout } from "./app/presence/timeout";
import { redis } from "./storage/redis";
import { startMetricsServer } from "@/app/monitoring/metrics";
import { activityCache } from "@/app/presence/sessionCache";
import { auth } from "./app/auth/auth";
import { startDatabaseMetricsUpdater } from "@/app/monitoring/metrics2";
import { initEncrypt } from "./modules/encrypt";
import { initGithub } from "./modules/github";
import { loadFiles } from "./storage/files";

async function main() {

    // Storage
    try {
        await db.$connect();
        console.log('[boot] db.$connect OK');
    } catch (e) {
        console.log(`[boot] db.$connect FAILED: ${e}`);
    }
    onShutdown('db', async () => {
        await db.$disconnect();
    });
    onShutdown('activity-cache', async () => {
        activityCache.shutdown();
    });

    try {
        await redis.ping();
        console.log('[boot] redis.ping OK');
    } catch (e) {
        console.log(`[boot] redis.ping FAILED: ${e}`);
    }

    // Initialize modules
    try {
        await initEncrypt();
        console.log('[boot] initEncrypt OK');
    } catch (e) {
        console.log(`[boot] initEncrypt FAILED: ${e}`);
    }
    try {
        await initGithub();
        console.log('[boot] initGithub OK');
    } catch (e) {
        console.log(`[boot] initGithub FAILED: ${e}`);
    }
    try {
        await loadFiles();
        console.log('[boot] loadFiles OK');
    } catch (e) {
        console.log(`[boot] loadFiles FAILED (non-fatal): ${e}`);
    }
    try {
        await auth.init();
        console.log('[boot] auth.init OK');
    } catch (e) {
        console.log(`[boot] auth.init FAILED: ${e}`);
    }

    //
    // Start
    //

    try {
        await startApi();
        console.log('[boot] startApi OK');
    } catch (e) {
        console.log(`[boot] startApi FAILED: ${e}`);
    }
    try {
        await startMetricsServer();
        console.log('[boot] metrics OK');
    } catch (e) {
        console.log(`[boot] metrics FAILED: ${e}`);
    }
    try {
        startDatabaseMetricsUpdater();
        console.log('[boot] dbMetrics OK');
    } catch (e) {
        console.log(`[boot] dbMetrics FAILED: ${e}`);
    }
    try {
        startTimeout();
        console.log('[boot] timeout OK');
    } catch (e) {
        console.log(`[boot] timeout FAILED: ${e}`);
    }

    //
    // Ready
    //

    log('Ready');
    console.log('[boot] READY');
    await awaitShutdown();
    log('Shutting down...');
}

// Process-level error handling - log but DON'T exit, let Docker handle it
process.on('uncaughtException', (error) => {
    console.error('[fatal] Uncaught Exception:', error.message);
    console.error(error.stack);
    log({
        module: 'process-error',
        level: 'error',
        stack: error.stack,
        name: error.name
    }, `Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = reason instanceof Error ? reason.message : String(reason);
    console.error('[fatal] Unhandled Rejection:', errorMsg);
    log({
        module: 'process-error',
        level: 'error',
        reason: String(reason)
    }, `Unhandled Rejection: ${errorMsg}`);
});

process.on('warning', (warning) => {
    log({
        module: 'process-warning',
        level: 'warn',
        name: warning.name,
        stack: warning.stack
    }, `Process Warning: ${warning.message}`);
});

// Log when the process is about to exit
process.on('exit', (code) => {
    console.log(`[boot] Process exiting with code: ${code}`);
    if (code !== 0) {
        log({
            module: 'process-exit',
            level: 'error',
            exitCode: code
        }, `Process exiting with code: ${code}`);
    } else {
        log({
            module: 'process-exit',
            level: 'info',
            exitCode: code
        }, 'Process exiting normally');
    }
});

main().catch((e) => {
    console.error('[boot] main() threw:', e.message);
    console.error(e.stack);
});
