import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatUptime', standalone: false })
export default class FormatUptimePipe implements PipeTransform {
    private readonly suffix = '%';

    /**
     * Formats a numeric uptime value to two decimal places with a % suffix.
     * @param {number | null} value - uptime percentage
     * @returns {string} formatted uptime string
     */
    transform(value: number | null): string {
        return value === null ? 'Undefined' : `${value.toFixed(2)}${this.suffix}`;
    }
}
