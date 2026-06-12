import { MigrationInterface } from 'mongo-migrate-ts';
import { Db } from 'mongodb';

export default class Samplescript1742229215459 implements MigrationInterface {
    private collectionName: string;

    /**
     *
     */
    constructor() {
        this.collectionName = 'Tasks';
    }

    /**
     * Applies the migration to Tasks.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    async up(db: Db): Promise<void> {
        // Create the collection and perform insert operation
        await this.createCollection(db);
        await this.insertDocuments(db);
    }

    /**
     * Reverts the migration by dropping the Tasks collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    async down(db: Db): Promise<void> {
        // Drop the collection if it exists
        await this.dropCollection(db);
    }

    /**
     * Creates new collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async createCollection(db: Db): Promise<void> {
        // Create the collection if it doesn't exist
        await db.createCollection(this.collectionName);
        console.log(`Collection '${this.collectionName}' created`);
    }

    /**
     * Inserts documents into collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async insertDocuments(db: Db): Promise<void> {
        // Insert multiple documents
        await db.collection(this.collectionName).insertMany([
            { name: 'Utility Bill', description: 'Pay utility bill', priority: 1 },
            { name: 'Mortgage', description: 'Pay mortgage', priority: 2 },
        ]);
        console.log('Inserted entries into Tasks collection');
    }

    /**
     * Search document in a collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async findDocument(db: Db): Promise<void> {
        // Find a document
        const foundDocument = await db.collection(this.collectionName).findOne({ priority: 1 });
        console.log('Found high priority entry:', foundDocument);
    }

    /**
     * Updates document in a collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async updateDocument(db: Db): Promise<void> {
        // Update a document
        const updateResult = await db
            .collection(this.collectionName)
            .updateOne({ name: 'Mortgage' }, { $set: { description: 'Pay mortgage quarterly' } });
        console.log('Updated entries count:', updateResult.modifiedCount);
    }

    /**
     * Search all documents in a collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async findAllDocuments(db: Db): Promise<void> {
        // Find all documents
        const allDocuments = await db.collection(this.collectionName).find({}).toArray();
        console.log('All entries:', allDocuments);
    }

    /**
     * Rename the collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async renameCollection(db: Db): Promise<void> {
        // Rename the collection
        const newCollectionName = 'TasksRenamed';
        await db.collection(this.collectionName).rename(newCollectionName);
        console.log(`Collection renamed to '${newCollectionName}'`);
    }

    /**
     * Delete a document from the collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async deleteDocument(db: Db): Promise<void> {
        // Delete a document
        const deleteResult = await db
            .collection(this.collectionName)
            .deleteOne({ name: 'Utility Bill' });
        console.log('Deleted entry count:', deleteResult.deletedCount);
    }

    /**
     * Drop the collection.
     * @param {Db} db - The database connection.
     * @returns {Promise<void>}
     */
    private async dropCollection(db: Db): Promise<void> {
        // Drop the collection
        const collections = await db.listCollections({ name: this.collectionName }).toArray();
        if (collections.length > 0) {
            await db.collection(this.collectionName).drop();
            console.log('Collection dropped');
        } else {
            console.log('Collection does not exist');
        }
    }
}
