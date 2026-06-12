import crypto from 'crypto';

/**
 * Utility method to create a mock ID. This will need to be replaced later.
 * @returns {string} A random 24 character hex string. Aligns with what a MongoDB OjectID will look like.
 */
export default function mockTaskId(): string {
    return crypto.randomBytes(12).toString('hex');
}
