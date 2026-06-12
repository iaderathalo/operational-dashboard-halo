import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, ObjectId } from 'mongodb';

import { CreateTaskRequest, TaskBase } from '@operational-dashboard/shared-api-model/model/tasks';

import MongoRepository from '../../repository/mongo/mongo-repository';
import sampleTasks from '../initData';
import { Task } from '../schemas/task.schema';
import { TaskRepository } from '../task.repository';

type MongoDbId = Record<'_id', ObjectId | string>;

@Injectable()
export default class MongoTaskRepository extends MongoRepository implements TaskRepository {
    taskCollection: Collection;

    collectionName = 'tasks';

    /**
     * @param {ConfigService} configService - A service class that provides access to application configuration values to read from secrets and environmental variables.
     * @param {Logger} logger - A class that provides logging functionality to stdout.
     */
    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    /**
     * Retrieves a single task by its ID
     * @param {object} taskID - The id of the task to be found
     * @returns {Promise<Task>} - A promise that resolves to a task object
     */
    async findOne(taskID): Promise<Task> {
        const { _id: id } = taskID;
        const task = await (
            await this.getCollection<Task>(this.collectionName)
        ).findOne(
            {
                _id: ObjectId.createFromHexString(id),
            },
            { projection: { _id: 0, id: '$_id', priority: 1, description: 1, name: 1 } }
        );

        return task;
    }

    /**
     * Retrieves all tasks
     * @returns {Promise<Task[]>} - A promise that resolves to an array of task objects
     */
    async findAll(): Promise<Task[]> {
        const tasks = (await (await this.getCollection<Task>(this.collectionName))
            .find()
            .toArray()) as Task[];

        return tasks.map((task: Task & MongoDbId) => {
            /* eslint-disable no-underscore-dangle, no-param-reassign */
            const id = String(task._id);

            delete task._id;
            return { ...task, id };
            /* eslint-enable no-underscore-dangle, no-param-reassign */
        });
    }

    /**
     * Update one task with New task object and corresponding Task ID.
     * @param {object} taskID - The id of the task to be updated
     * @param {TaskBase} entity - The new properties for the task
     * @returns {Promise<number>} - A promise that responds with number of updated entities.
     */
    async updateOne(taskID, entity: TaskBase): Promise<number> {
        const { _id: id } = taskID;

        const resp = await (
            await this.getCollection(this.collectionName)
        ).findOneAndReplace({ _id: ObjectId.createFromHexString(id) }, entity);
        // eslint-disable-next-line no-underscore-dangle
        return resp._id ? 1 : 0;
    }

    /**
     * Deletes a single task from the database by its taskID
     * @param {string} taskID - The id of the task to be deleted
     * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating whether the task was successfully deleted
     */
    async deleteOne(taskID): Promise<boolean> {
        const { _id: id } = taskID;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).deleteOne({
            _id: ObjectId.createFromHexString(id),
        });
        return Boolean(resp.deletedCount);
    }

    /**
     * Creates a new task in the database
     * @param {CreateTaskRequest} task - The task information to create
     * @returns {Promise<object>} - Returns a promise that resolves to the ID of the created task
     */
    async create(task: CreateTaskRequest): Promise<object> {
        const resp = await (
            await this.getCollection<TaskBase>(this.collectionName)
        ).insertOne({ ...task });
        return resp.insertedId;
    }

    /**
     * Deletes all tasks
     * @returns {Promise<number>} Number of deleted tasks.
     */
    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.collectionName)).deleteMany({});
        return resp.deletedCount;
    }

    /**
     * This method is intended to simplify the setup of the initial template application.
     * This is not a pattern of implementation that is being promoted outside of the initial template.
     */
    async initDb() {
        await this.createCollectionIfNotExists();

        await this.populateTasksIfUnavailable();
    }

    /**
     * This function creates a new collection if it doesn't exist in the MongoDB instance.
     * The collection is named as Tasks, and it validates the documents against the JSON Schema before inserting.
     * The schema enforces the presence of fields name, description, and priority.
     */
    async createCollectionIfNotExists() {
        const collectionList = await (
            await this.database.listCollections().toArray()
        ).find((collection) => collection.name === this.collectionName);

        if (!collectionList) {
            this.logger.info(
                `The [${this.collectionName}] does not exist, creating collection [${this.collectionName}]`
            );
            this.database.createCollection(this.collectionName, {
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['name', 'description', 'priority'],
                        properties: {
                            name: {
                                bsonType: 'string',
                                description: 'Name is required field',
                            },
                            description: {
                                bsonType: 'string',
                                description: 'Description is required field',
                            },
                            priority: {
                                bsonType: 'number',
                                minimum: 0,
                                maximum: 1000,
                                description:
                                    'priority is a required field and must be between 0 to 1000',
                            },
                        },
                    },
                },
            });
        }
    }

    /**
     * This function checks if there are any documents in the collection and if not, it populates the collection with sample data.
     * The sample data is stored in a constant named sampleTasks and the number of documents inserted is logged.
     */
    async populateTasksIfUnavailable() {
        this.logger.info(`Inserting metadata into collection [${this.collectionName}]`);
        const taskCollection = await this.getCollection<TaskBase & MongoDbId>(this.collectionName);
        const taskCount = (await taskCollection.find().toArray()).length;
        if (taskCount < 3) {
            const tasksWithObjectId = sampleTasks.map((task) => ({
                ...task,
                // eslint-disable-next-line no-underscore-dangle
                _id: ObjectId.createFromHexString(task._id),
            }));
            const { insertedCount } = await taskCollection.insertMany(tasksWithObjectId);

            this.logger.info(`[${insertedCount}] documents were populated in the Task collection`);
        }
    }
}
