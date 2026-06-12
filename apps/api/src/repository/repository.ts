/**
 * Base repository implementation
 */

export interface Repository<T> {
    /**
     * Retrieves the properties based on Id passed to the method
     * @template T
     * @example findOne( {'_id':'ac6224bf-b41d-4bd5-bce0-f2a0e8bd5a40'})
     * @param id ID of the document/row to search
     * @returns {Promise<T>} Instance of one single task object.
     */
    findOne(id: object): Promise<T>;

    /**
     * Retrieves all the collection / recordSet as Array of object.
     * @template T
     * @returns {Promise<T[]>} Instance of all tasks.
     */
    findAll(): Promise<T[]>;

    /**
     * Updates the  property associated with the ID provided
     * @template T
     * @example updateOne({'_id':'ac6224bf-b41d-4bd5-bce0-f2a0e8bd5a40'}, {'_id':'ac6224bf-b41d-4bd5-bce0-f2a0e8bd5a40',name:'Enable Authentication', description:'Setup Okta ID config', priority:2})
     * @param {object} id ID of the property to update
     * @param {Object<T>} Entity updated  object with the parameters
     * @returns {Promise<number>}  Count of updated documents.
     */
    updateOne(id: object, entity: T): Promise<number>;

    /**
     * Deletes the records for the provided ID
     * @param {object} id ID of the records that has to be deleted from the table / collection.
     * @returns {Promise<boolean>} acknowledgement of the deletion.
     */
    deleteOne(id: object): Promise<boolean>;

    /**
     * Creates a new record  based on input parameter
     * @template T
     * @param {T} entity Object property, as key value *
     * @returns {Promise<string | object>} Id of the newly created record
     */
    create(entity: T): Promise<string | object>;

    /**
     * Deletes all the records in the table/Collection
     * @returns {Promise<number>} count of deleted records
     */
    deleteAll(): Promise<number>;
}
