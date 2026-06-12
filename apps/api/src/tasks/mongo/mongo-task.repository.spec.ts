import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MockProxy, mock } from 'jest-mock-extended';
import { when } from 'jest-when';
import { ObjectId } from 'mongodb';

import MongoTaskRepository from './mongo-task.repository';
import MongoRepository from '../../repository/mongo/mongo-repository';
import sampleTasks from '../initData';

let taskRepository: MongoTaskRepository;
let mockLogger: MockProxy<Logger>;
let mockConfigService: MockProxy<ConfigService>;

const mockTasks = [
    { _id: '1', description: 'Renew TV license', name: 'TV license', priority: 1 },
    { _id: '2', description: 'Solve Puzzle #14', name: 'Puzzle', priority: 2 },
];
const expectedTask = [
    { id: '1', description: 'Renew TV license', name: 'TV license', priority: 1 },
    { id: '2', description: 'Solve Puzzle #14', name: 'Puzzle', priority: 2 },
];
const mockCollection = {
    deleteMany: jest.fn().mockReturnThis(),
    insertOne: jest.fn().mockReturnThis(),
    findOneAndReplace: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    deleteOne: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockReturnThis(),
    listCollections: jest.fn().mockReturnThis(),
    insertMany: jest.fn().mockReturnThis(),
    createCollection: jest.fn().mockReturnThis(),
};

const mockMongoCollection = jest.spyOn(MongoRepository.prototype, 'getCollection');

beforeEach(async () => {
    mockLogger = mock<Logger>();
    const get = jest.fn();

    mockMongoCollection.mockResolvedValue(mockCollection as never);

    when(get).calledWith('API_DATASTORE_NAME').mockReturnValue('app');
    mockConfigService = mock<ConfigService>({ get });
    const app = await Test.createTestingModule({
        providers: [
            MongoTaskRepository,
            {
                provide: ConfigService,
                useValue: mockConfigService,
            },
            {
                provide: Logger,
                useValue: mockLogger,
            },
        ],
    }).compile();
    taskRepository = app.get<MongoTaskRepository>(MongoTaskRepository);
});

afterEach(() => {
    jest.clearAllMocks();
});

describe('MongoTaskRepository', () => {
    it('Mongo Task repository should be defined', () => {
        expect(taskRepository).toBeDefined();
    });
    it('find one should return one document', async () => {
        const id = new ObjectId();
        mockCollection.findOne.mockResolvedValueOnce(mockTasks[0]);
        const task = await taskRepository.findOne({ _id: String(id) });
        expect(mockCollection.findOne).toHaveBeenCalledTimes(1);
        expect(mockCollection.findOne).toHaveBeenCalledWith(
            { _id: id },
            {
                projection: {
                    _id: 0,
                    description: 1,
                    id: '$_id',
                    name: 1,
                    priority: 1,
                },
            }
        );
        expect(task).toBe(mockTasks[0]);
    });
    it('find all should return all documents', async () => {
        mockCollection.toArray.mockResolvedValueOnce(mockTasks);

        const tasks = await taskRepository.findAll();
        expect(mockCollection.find).toHaveBeenCalledTimes(1);
        expect(mockCollection.toArray).toHaveBeenCalledTimes(1);
        expect(tasks).toStrictEqual(expectedTask);
    });

    it('update one should invoke update  method', async () => {
        const id = new ObjectId();

        mockCollection.findOneAndReplace.mockResolvedValueOnce({ _id: 1 });

        const results = await taskRepository.updateOne({ _id: id.toHexString() }, mockTasks[0]);
        expect(mockCollection.findOneAndReplace).toHaveBeenCalledTimes(1);

        expect(results).toBe(1);
    });

    it('delete all should call delete method in collection', async () => {
        mockCollection.deleteMany.mockResolvedValueOnce({ deletedCount: 2 });

        const response = await taskRepository.deleteAll();
        expect(mockCollection.deleteMany).toHaveBeenCalledTimes(1);
        expect(response).toBe(2);
    });
    it('delete one should return all value', async () => {
        const id = new ObjectId();
        mockCollection.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

        const tasks = await taskRepository.deleteOne({ _id: id.toHexString() });
        expect(mockCollection.deleteOne).toHaveBeenCalledTimes(1);
        expect(tasks).toBe(true);
    });
    it('Create should return ID value', async () => {
        const id = new ObjectId();
        mockCollection.insertOne.mockResolvedValueOnce({ insertedId: id });

        const tasks = await taskRepository.create(mockTasks[0]);
        expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
        expect(mockCollection.insertOne).toHaveBeenCalledWith({
            ...mockTasks[0],
        });
        expect(tasks).toBe(id);
    });

    it('Create collection must check, if collection exists in the selected database', async () => {
        taskRepository.database = mockCollection as never;
        const mockCollectionList = [
            {
                name: 'tasks',
                id: 1,
            },
            { name: 'dba_logs', id: 2 },
        ];
        mockCollection.toArray.mockResolvedValueOnce(mockCollectionList);
        await taskRepository.createCollectionIfNotExists();
        expect(mockCollection.listCollections).toHaveBeenCalledTimes(1);
        expect(mockCollection.toArray).toHaveBeenCalledTimes(1);
        expect(mockCollection.createCollection).not.toHaveBeenCalled();
    });
    it('Create collection must create collection with validations if not exists', async () => {
        taskRepository.database = mockCollection as never;
        const validatorSchema = {
            validator: {
                $jsonSchema: {
                    bsonType: 'object',
                    properties: {
                        description: {
                            bsonType: 'string',
                            description: 'Description is required field',
                        },
                        name: { bsonType: 'string', description: 'Name is required field' },
                        priority: {
                            bsonType: 'number',
                            description:
                                'priority is a required field and must be between 0 to 1000',
                            maximum: 1000,
                            minimum: 0,
                        },
                    },
                    required: ['name', 'description', 'priority'],
                },
            },
        };
        const mockCollectionList = [{ name: 'dba_logs', id: 2 }];
        mockCollection.toArray.mockResolvedValueOnce(mockCollectionList);
        await taskRepository.createCollectionIfNotExists();
        expect(mockCollection.listCollections).toHaveBeenCalledTimes(1);
        expect(mockCollection.toArray).toHaveBeenCalledTimes(1);
        expect(mockCollection.createCollection).toHaveBeenCalledTimes(1);
        expect(mockCollection.createCollection).toHaveBeenCalledWith('tasks', validatorSchema);
    });

    it('Should populate task, if collection length is less than three', async () => {
        taskRepository.database = {
            collection() {
                return mockCollection;
            },
        } as never;
        mockCollection.toArray.mockResolvedValueOnce(mockTasks);
        await taskRepository.populateTasksIfUnavailable();
        expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);
        const tasksWithObjectId = sampleTasks.map((task) => ({
            ...task,
            // eslint-disable-next-line no-underscore-dangle
            _id: new ObjectId(task._id),
        }));

        expect(mockCollection.insertMany).toHaveBeenCalledWith(tasksWithObjectId);
        expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });
});
