import trace from 'dd-trace';

/**
 * Start Datadog tracing
 */
function initTracing(): void {
    if (this.get('DD_APM_ENABLED') === 'true') {
        trace.init({
            hostname: this.get('OSS20_KUBERNETES_HOST_IP'), // this value is available by default at the chart level
            env: this.get('DD_ENV'),
            service: this.get('DD_SERVICE'),
            tags: { env: this.get('DD_ENV'), apptype: 'nodejs' },
            logInjection: true,
        });
    }
}

export default initTracing;
