import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatActiveUsers', standalone: false })
export default class FormatActiveUsersPipe implements PipeTransform {
    private readonly fallback = 'Undefined';

    /**
     * Formats a numeric active users count with locale-aware thousand separators.
     * @param {number | null} value - active user count
     * @returns {string} formatted user count string
     */
    transform(value: number | null): string {
        return value === null ? this.fallback : value.toLocaleString();
    }
}
