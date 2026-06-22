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

    // Database
    try {
        await db.$connect();
    } catch (e) {
        log({ module: 'db', level: 'fatal' }, `Database connection failed: ${e}`);
    }
    onShutdown('db', async () => {
        await db.$disconnect();
    });
    onShutdown('activity-cache', async () => {
        activityCache.shutdown();
    });

    // Redis
    try {
        await redis.ping();
    } catch (e) {
        log({ module: 'redis', level: 'fatal' }, `Redis connection failed: ${e}`);
    }

    // Module initialization
    try {
        await initEncrypt();
    } catch (e) {
        log({ module: 'encrypt', level: 'error' }, `Encryption init failed: ${e}`);
    }
    try {
        await initGithub();
    } catch (e) {
        log({ module: 'github', level: 'error' }, `GitHub init failed: ${e}`);
    }
    try {
        await loadFiles();
    } catch (e) {
        log({ module: 's3', level: 'warn' }, `S3 storage not available: ${e}`);
    }
    try {
        await auth.init();
    } catch (e) {
        log({ module: 'auth', level: 'error' }, `Auth init failed: ${e}`);
    }

    // Start servers
    try {
        await startApi();
    } catch (e) {
        log({ module: 'api', level: 'fatal' }, `API server failed: ${e}`);
    }
    try {
        await startMetricsServer();
    } catch (e) {
        log({ module: 'metrics', level: 'error' }, `Metrics server failed: ${e}`);
    }
    try {
        startDatabaseMetricsUpdater();
    } catch (e) {
        log({ module: 'metrics2', level: 'error' }, `DB metrics updater failed: ${e}`);
    }
    try {
        startTimeout();
    } catch (e) {
        log({ module: 'timeout', level: 'error' }, `Timeout handler failed: ${e}`);
    }

    log('Ready');
    await awaitShutdown();
    log('Shutting down...');
}

// Process-level error handling
process.on('uncaughtException', (error) => {
    log({
        module: 'process-error',
        level: 'error',
        stack: error.stack,
        name: error.name
    }, `Uncaught Exception: ${error.message}`);
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    log({
        module: 'process-error',
        level: 'error',
        reason: String(reason)
    }, `Unhandled Rejection: ${reason}`);
    console.error('Unhandled Rejection:', reason);
});

process.on('warning', (warning) => {
    log({
        module: 'process-warning',
        level: 'warn',
        name: warning.name,
        stack: warning.stack
    }, `Process Warning: ${warning.message}`);
});

process.on('exit', (code) => {
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
    console.error('main() threw:', e);
});
