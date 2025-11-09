// Temporarily disabled for development to prevent crashes
// import * as Sentry from "@sentry/nextjs";

export function register() {
    // Sentry.init({
    //     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    //     tracesSampleRate: Number(process.env.SENTRY_BACKEND_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    //     enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    // });
    console.log('Instrumentation disabled for development');
}
