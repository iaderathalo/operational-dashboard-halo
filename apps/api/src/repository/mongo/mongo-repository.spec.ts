import { execSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing/test';
import axios from 'axios';
import { mock, MockProxy } from 'jest-mock-extended';
import { when } from 'jest-when';
import { MongoClient } from 'mongodb';

import { PROJECT_NAME } from '@app/config';

import MongoRepository from './mongo-repository';

jest.mock('node:fs/promises');
jest.mock('node:fs');
jest.mock('fs');
jest.mock('node:child_process');

const dbMock = {
    command: jest.fn().mockReturnValue({}),
    collection: jest.fn().mockReturnValue({}),
};

const mockMongoClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    db: jest.fn().mockReturnValue(dbMock),
};

jest.mock('mongodb', () => ({
    MongoClient: jest.fn(() => mockMongoClient),
}));

let repository: MongoRepository;
let mockConfigService: MockProxy<ConfigService>;
let mockLogger: MockProxy<Logger>;

beforeEach(async () => {
    mockLogger = mock<Logger>();
    const get = jest.fn();
    when(get)
        .calledWith('API_MONGODB_API_DB_URL')
        .mockReturnValue('mongodb://db:27017')
        .calledWith('API_MONGO_DB_CERTIFICATE')
        .mockReturnValue('this is a mock certificate value')
        .calledWith('VAULT_URL')
        .mockReturnValue('https://a-vault.url/login/');

    mockConfigService = mock<ConfigService>({ get });

    const app = await Test.createTestingModule({
        providers: [
            MongoRepository,
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

    repository = app.get<MongoRepository>(MongoRepository);
});

afterEach(() => {
    jest.clearAllMocks();
});

describe('mongoRepositoryTest', () => {
    it('should be defined', () => {
        expect(repository).toBeDefined();
    });

    it('should connect to mongo DB when no certificate is required', async () => {
        const actualConnection = await repository.getDatabase();
        expect(actualConnection).toStrictEqual({
            command: expect.any(Function),
            collection: expect.any(Function),
        });
        expect(MongoClient).toHaveBeenCalledTimes(1);
    });

    it('should connect to mongo DB when a certificate is required and provided', async () => {
        mockConfigService.get.mockReturnValueOnce('this is a mock certificate value');
        const writeFileMock = jest.spyOn(fs, 'writeFile').mockResolvedValueOnce();
        fsSync.readFileSync = jest.fn();

        const actualConnection = await repository.getDatabase();

        expect(actualConnection).toStrictEqual(dbMock);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        expect(mockMongoClient.db).toHaveBeenCalledTimes(1);
        expect(writeFileMock).toHaveBeenCalledTimes(1);
        expect(writeFileMock).toHaveBeenCalledWith(
            './MongoCert.pem',
            'this is a mock certificate value'
        );
    });

    it('should NOT connect to mongo DB when a certificate is provided but an error occurs writing it to a file', async () => {
        mockConfigService.get.mockReturnValueOnce('this is another mock certificate value');
        const writeFileMock = jest
            .spyOn(fs, 'writeFile')
            .mockRejectedValueOnce(new Error('There was an error writing to the file.'));

        let actualConnection;
        let getDatabaseError;
        try {
            actualConnection = await repository.getDatabase();
        } catch (error) {
            getDatabaseError = error;
        }

        expect(getDatabaseError).toEqual(
            new Error('Unable to establish connection to the database')
        );
        expect(actualConnection).toBeUndefined();
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(0);
        expect(mockMongoClient.db).toHaveBeenCalledTimes(0);
        expect(writeFileMock).toHaveBeenCalledTimes(1);
        expect(writeFileMock).toHaveBeenCalledWith(
            './MongoCert.pem',
            'this is another mock certificate value'
        );
    });

    it('should get collection when invoked', async () => {
        const collectionName = 'tasks';
        dbMock.collection.mockReturnValue(collectionName);
        const actualCollection = await repository.getCollection(collectionName);
        expect(actualCollection).toBe(collectionName);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        expect(mockMongoClient.db).toHaveBeenCalledTimes(1);
    });

    it('should prefix collection name with project key when flag is true', async () => {
        const collectionName = 'tasks';
        mockConfigService.get.mockReturnValueOnce('true');
        const expectedCollectionName = `${PROJECT_NAME.toLowerCase()}_${collectionName}`;
        mockMongoClient.db().collection.mockReturnValue({});
        const actualCollection = await repository.getCollection(collectionName);
        expect(mockMongoClient.db).toHaveBeenCalledTimes(2);
        expect(mockMongoClient.db().collection).toHaveBeenCalledWith(expectedCollectionName);
        expect(actualCollection).toBeDefined();
    });

    it('should return the collection name unchanged when flag is false', async () => {
        const collectionName = 'tasks';
        mockConfigService.get.mockReturnValueOnce('false');
        mockMongoClient.db().collection.mockReturnValue({});
        const actualCollection = await repository.getCollection(collectionName);
        expect(mockMongoClient.db).toHaveBeenCalledTimes(2);
        expect(mockMongoClient.db().collection).toHaveBeenCalledWith(collectionName);
        expect(actualCollection).toBeDefined();
    });

    it('getCollection Should not prefix collection with project key if flag is not true', async () => {
        const collectionName = 'test-collection';
        dbMock.collection.mockReturnValue(collectionName);
        mockConfigService.get.mockReturnValueOnce('false');
        const newCollectionName = await repository.getCollection(collectionName);
        expect(newCollectionName).toBe(collectionName);
    });

    it('old MongoDB Atlas credentials should be replaced by new ones', () => {
        const oldInstanceUrl =
            'mongodb+srv://OLD_USERNAME:OLD_PASSWORD@m-aws-18-10-23-14-24-52-6503061dc9c9be0f98bc8fb3-pl-0.0gfyy.mongodb.net/coreapi-vector-store?retryWrites=true&w=majority';
        const newInstanceUrl =
            'mongodb+srv://NEW_USERNAME:NEW_PASSWORD@m-aws-18-10-23-14-24-52-6503061dc9c9be0f98bc8fb3-pl-0.0gfyy.mongodb.net/coreapi-vector-store?retryWrites=true&w=majority';
        expect(
            MongoRepository.replaceMongoDbCredentialsInUrl(
                oldInstanceUrl,
                'NEW_USERNAME',
                'NEW_PASSWORD'
            )
        ).toBe(newInstanceUrl);
    });
});

const expirationDateTestScenarios = [
    [
        {
            expiration: 3600,
            percentage: 90,
            inputDate: new Date('December 24, 2023 01:00:00'),
            outputDate: new Date('December 24, 2023 01:54:00'),
        },
    ],
    [
        {
            expiration: 3600,
            percentage: 50,
            inputDate: new Date('December 24, 2023 01:00:00'),
            outputDate: new Date('December 24, 2023 01:30:00'),
        },
    ],
    [
        {
            expiration: 3600,
            percentage: 50,
            inputDate: new Date('December 24, 2023 23:45:00'),
            outputDate: new Date('December 25, 2023 00:15:00'),
        },
    ],
];

describe.each(expirationDateTestScenarios)('Expiration dates are set correctly when', (params) => {
    it(`lease expiration is ${params.expiration} seconds and date uses ${params.percentage}% of that`, () => {
        expect(
            MongoRepository.setCredentialsExpirationDate(
                params.expiration,
                params.percentage,
                params.inputDate
            )
        ).toStrictEqual(params.outputDate);
    });
});

const areCredentialsExpiredTestScenarios = [
    [
        {
            description: 'credential expiration date is same as current date',
            credentials: {
                username: 'user',
                password: 'pass',
                expiration: new Date('December 24, 2023 01:00:00'),
            },
            currentDate: new Date('December 24, 2023 01:00:00'),
            output: true,
        },
    ],
    [
        {
            description: 'credential expiration date is later than current date',
            credentials: {
                username: 'user',
                password: 'pass',
                expiration: new Date('December 24, 2023 01:00:00'),
            },
            currentDate: new Date('December 24, 2023 00:30:00'),
            output: false,
        },
    ],
    [
        {
            description: 'credential expiration date is earlier than current date',
            credentials: {
                username: 'user',
                password: 'pass',
                expiration: new Date('December 24, 2023 01:00:00'),
            },
            currentDate: new Date('December 24, 2023 01:15:00'),
            output: true,
        },
    ],
    [
        {
            description: 'credentials are not present',
            credentials: undefined,
            currentDate: new Date('December 24, 2023 01:15:00'),
            output: true,
        },
    ],
    [
        {
            description: 'credential expiration date is not present',
            credentials: {
                username: 'user',
                password: 'pass',
                expiration: undefined,
            },
            currentDate: new Date('December 24, 2023 01:15:00'),
            output: true,
        },
    ],
];

describe.each(areCredentialsExpiredTestScenarios)(
    'Credential expiration status is determined successfully to be',
    (params) => {
        it(`${params.output} when ${params.description}`, () => {
            expect(
                MongoRepository.areMongoDbAtlasCredentialsExpired(
                    params.credentials,
                    params.currentDate
                )
            ).toBe(params.output);
        });
    }
);

describe('AWS Vault Authentication', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully retrieve vault token using AWS auth', async () => {
        const mockVaultToken = 'hvs.CAESTEST1234567890abcdefghijklmnop';
        const mockJwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.test.test';
        const mockExecutable = execSync as jest.MockedFunction<typeof execSync>;
        mockExecutable.mockReturnValueOnce(Buffer.from(`${mockVaultToken}\n`));

        jest.spyOn(fs, 'readFile').mockResolvedValueOnce(mockJwt);

        mockConfigService.get
            .mockReturnValueOnce('arn:aws:iam::123456789012:role/test-role') // AWS_ROLE_ARN
            .mockReturnValueOnce('aws') // VAULT_AWS_AUTH_BACKEND
            .mockReturnValueOnce('us-east-1') // VAULT_AWS_REGION
            .mockReturnValueOnce('https://vault.example.com') // VAULT_ADDR
            .mockReturnValueOnce('test-namespace'); // VAULT_NAMESPACE

        const vaultToken = await repository.getVaultTokenUsingKubernetesJwt({
            vaultNamespace: 'test-namespace',
            vaultUrl: 'https://vault.example.com',
            useAwsAuth: true,
            jwtFileLocation: '/var/run/secrets/aws/token',
        });

        expect(vaultToken).toBe(mockVaultToken);
        expect(mockExecutable).toHaveBeenCalledWith('mpc vault perform-aws-auth', {
            encoding: 'utf-8',
        });
        expect(mockExecutable).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalledWith(
            'Getting Vault token using MPC CLI command: mpc vault perform-aws-auth'
        );
    });

    it('should handle errors when AWS auth command fails', async () => {
        const mockError = new Error('Command failed: mpc vault perform-aws-auth');
        const mockJwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.test.test';
        const mockExecutable = execSync as jest.MockedFunction<typeof execSync>;
        mockExecutable.mockImplementationOnce(() => {
            throw mockError;
        });

        jest.spyOn(fs, 'readFile').mockResolvedValueOnce(mockJwt);

        mockConfigService.get
            .mockReturnValueOnce('arn:aws:iam::123456789012:role/test-role')
            .mockReturnValueOnce('aws')
            .mockReturnValueOnce('us-east-1')
            .mockReturnValueOnce('https://vault.example.com')
            .mockReturnValueOnce('test-namespace');

        await expect(
            repository.getVaultTokenUsingKubernetesJwt({
                vaultNamespace: 'test-namespace',
                vaultUrl: 'https://vault.example.com',
                useAwsAuth: true,
                jwtFileLocation: '/var/run/secrets/aws/token',
            })
        ).rejects.toThrow(mockError);

        expect(mockLogger.error).toHaveBeenCalledWith(
            'Error encountered while getting Vault token using AWS Auth.',
            { error: mockError }
        );
    });

    it('should log environment variable status when using AWS auth', async () => {
        const mockVaultToken = 'hvs.CAESTEST1234567890abcdefghijklmnop';
        const mockJwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.test.test';
        const mockExecutable = execSync as jest.MockedFunction<typeof execSync>;
        mockExecutable.mockReturnValueOnce(Buffer.from(mockVaultToken));

        jest.spyOn(fs, 'readFile').mockResolvedValueOnce(mockJwt);

        mockConfigService.get
            .mockReturnValueOnce('arn:aws:iam::123456789012:role/test-role')
            .mockReturnValueOnce('aws')
            .mockReturnValueOnce('us-east-1')
            .mockReturnValueOnce('https://vault.example.com')
            .mockReturnValueOnce('test-namespace');

        await repository.getVaultTokenUsingKubernetesJwt({
            vaultNamespace: 'test-namespace',
            vaultUrl: 'https://vault.example.com',
            useAwsAuth: true,
            jwtFileLocation: '/var/run/secrets/aws/token',
        });

        expect(mockLogger.info).toHaveBeenCalledWith(
            'Validating that the required environment variables have been set...'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringMatching(/^Env status:.*AWS_ROLE_ARN=.*VAULT_AWS_AUTH_BACKEND=.*/)
        );
    });

    it('should use Kubernetes JWT auth when useAwsAuth is false', async () => {
        const mockVaultToken = 'hvs.CAESTEST0987654321zyxwvutsrqponmlk';
        const mockJwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.test.test';
        const mockExecutable = execSync as jest.MockedFunction<typeof execSync>;

        jest.spyOn(fs, 'readFile').mockResolvedValueOnce(mockJwt);

        // Mock axios post for Kubernetes JWT auth

        axios.post = jest.fn().mockResolvedValueOnce({
            data: {
                auth: {
                    client_token: mockVaultToken,
                },
            },
        });

        mockConfigService.get.mockReturnValueOnce('test-role'); // VAULT_ROLE_NAME

        const vaultToken = await repository.getVaultTokenUsingKubernetesJwt({
            vaultNamespace: 'test-namespace',
            vaultUrl: 'https://vault.example.com',
            useAwsAuth: false,
            jwtFileLocation: '/var/run/secrets/kubernetes.io/serviceaccount/token',
        });

        expect(vaultToken).toBe(mockVaultToken);
        expect(mockExecutable).not.toHaveBeenCalled();
        expect(axios.post).toHaveBeenCalledWith(
            'https://vault.example.com',
            {
                role: 'test-role',
                jwt: mockJwt,
            },
            {
                headers: {
                    'X-Vault-Namespace': 'test-namespace',
                    'Content-Type': 'application/json',
                },
            }
        );
    });

    it('should trim whitespace from AWS auth token response', async () => {
        const mockVaultToken = 'hvs.CAESTEST1234567890abcdefghijklmnop';
        const mockJwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.test.test';
        const mockExecutable = execSync as jest.MockedFunction<typeof execSync>;
        mockExecutable.mockReturnValueOnce(Buffer.from(`  ${mockVaultToken}  \n\t`));

        jest.spyOn(fs, 'readFile').mockResolvedValueOnce(mockJwt);

        mockConfigService.get
            .mockReturnValueOnce('arn:aws:iam::123456789012:role/test-role')
            .mockReturnValueOnce('aws')
            .mockReturnValueOnce('us-east-1')
            .mockReturnValueOnce('https://vault.example.com')
            .mockReturnValueOnce('test-namespace');

        const vaultToken = await repository.getVaultTokenUsingKubernetesJwt({
            vaultNamespace: 'test-namespace',
            vaultUrl: 'https://vault.example.com',
            useAwsAuth: true,
            jwtFileLocation: '/var/run/secrets/aws/token',
        });

        expect(vaultToken).toBe(mockVaultToken);
        expect(vaultToken).not.toContain('\n');
        expect(vaultToken).not.toContain(' ');
        expect(vaultToken).not.toContain('\t');
    });
});
