import { MigrationInterface } from 'mongo-migrate-ts';
import { Db } from 'mongodb';

const PROJECT_NAME = 'operational-dashboard';

/**
 * Resolves the collection name, honoring the optional project-key prefix.
 * @param {string} baseName - the unprefixed collection name.
 * @returns {string} the effective collection name.
 */
function resolveCollectionName(baseName: string): string {
    return process.env.PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY === 'true'
        ? `${PROJECT_NAME.toLowerCase()}_${baseName}`
        : baseName;
}

/**
 * Creates the collection if it does not already exist.
 * @param {Db} db - The database connection.
 * @param {string} collectionName - the collection to ensure.
 * @returns {Promise<void>}
 */
async function ensureCollection(db: Db, collectionName: string): Promise<void> {
    const collections = await db.listCollections({ name: collectionName }).toArray();

    if (!collections.length) {
        await db.createCollection(collectionName);
    }
}

/**
 * Baseline indexes for the `applications` collection.
 *
 * Runs after the PlanView load migration (later timestamp), so the collection
 * already exists and is populated. Indexes the fields the dashboard queries by:
 *  - `shortCode`           -> app lookup / Datadog `app_short_key` correlation
 *  - `itOwnerEmail`        -> portfolio owner-scoping filter
 *  - `portfolioOwnerEmail` -> portfolio owner-scoping filter
 *
 * Idempotent: `createIndex` is a no-op if the index already exists, and the
 * collection is created if missing, so the migration is safe to re-run.
 */
export default class IndexApplications1781100000000 implements MigrationInterface {
    private readonly baseCollectionName = 'applications';

    /**
     * Applies the baseline indexes.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    async up(db: Db): Promise<void> {
        const collectionName = resolveCollectionName(this.baseCollectionName);
        await ensureCollection(db, collectionName);

        const collection = db.collection(collectionName);
        await collection.createIndex({ shortCode: 1 }, { name: 'idx_shortCode' });
        await collection.createIndex({ itOwnerEmail: 1 }, { name: 'idx_itOwnerEmail' });
        await collection.createIndex(
            { portfolioOwnerEmail: 1 },
            { name: 'idx_portfolioOwnerEmail' }
        );

        console.log(`Ensured baseline indexes on ${collectionName}`);
    }

    /**
     * Forward-only migration: indexes are left in place on rollback. Avoiding
     * drop/delete keywords also keeps this out of the destructive-operation
     * guard (check-db-scripts.yml).
     * @returns {Promise<void>}
     */
    async down(): Promise<void> {
        console.log(
            `Index migration for ${this.baseCollectionName} is forward-only; leaving indexes in place.`
        );
    }
}
