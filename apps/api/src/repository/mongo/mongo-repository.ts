/* eslint-disable max-lines-per-function */
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Collection, Db, MongoClient } from 'mongodb';

import { PROJECT_NAME } from '@app/config';

interface VaultTokenParameters {
    jwtFileLocation: string;
    vaultNamespace: string;
    vaultUrl: string;
    useAwsAuth?: boolean;
}

interface MongoDbCredentials {
    username: string;
    password: string;
    expiration: Date;
}

@Injectable()
export default class MongoRepository {
    readonly MONGO_CERTIFICATE_PATH = './MongoCert.pem';

    mongoInstanceURL: string;

    databaseName: string;

    database: Db;

    isMongoDbAtlas: boolean;

    mongoDbAtlasCredentials: MongoDbCredentials;

    /**
     * @param {ConfigService} configService - A service class that provides access to application configuration values to read from secrets and environmental variables.
     * @param {Logger} logger - A class that provides logging functionality to stdout.
     */
    constructor(
        private configService: ConfigService,
        public logger: Logger
    ) {
        this.mongoInstanceURL =
            this.configService.get<string>('API_MONGODB_API_DB_URL') ||
            this.configService.get<string>('API_MONGODB_DB_URL');
        this.isMongoDbAtlas = this.mongoInstanceURL?.includes('mongodb.net');
    }

    /**
     * Creates a file containing the provided certificate data
     * @param {string} certificate - A string containing the certificate data to be written to the file.
     * @returns {Promise<void>} - A promise that resolves when the file has been successfully written, or rejected if an error occurs.
     */
    async createCertificateFile(certificate: string): Promise<void> {
        this.logger.info(
            `Attempting to write Mongo certificate to [${this.MONGO_CERTIFICATE_PATH}] with certificate of length [${certificate.length}].`
        );

        try {
            await writeFile(this.MONGO_CERTIFICATE_PATH, certificate);
            this.logger.info(
                `Mongo certificate was successfully written to [${this.MONGO_CERTIFICATE_PATH}].`
            );
        } catch (error) {
            this.logger.error(
                `There was an error writing the Mongo certificate to [${this.MONGO_CERTIFICATE_PATH}].`,
                { error }
            );

            throw error;
        }
    }

    /**
     * Credentials replacing utility that helps with dynamic password rotation policy
     * @param {string} oldUrl - connection string from vault or credential that is about to expire.
     * @param {string} newUsername - User name of Mongodb from Vault.
     * @param {string} newPassword - Password of Mongodb from Vault.
     * @returns {string} Updated Connection string.
     */
    static replaceMongoDbCredentialsInUrl(
        oldUrl: string,
        newUsername: string,
        newPassword: string
    ): string {
        // eslint-disable-next-line prefer-const
        let [head, tail] = oldUrl.split('@');
        tail ??= head.split('://')[1];
        const scheme = head.split('://')[0];
        return `${scheme}://${newUsername}:${newPassword}@${tail}`;
    }

    /**
     * Sets the expiration date for credentials based on the provided parameters.
     * @param {number} expirationInSeconds - The expiration time for the credentials in seconds.
     * @param {number} percentageOfLeaseUntilExpiration - The percentage of the lease until expiration (default: 90%).
     * @param {Date} currentDate - The current date (default: current system date).
     * @returns {Date} - The expiration date for the credentials.
     */
    static setCredentialsExpirationDate(
        expirationInSeconds: number,
        percentageOfLeaseUntilExpiration = 90,
        currentDate: Date = new Date()
    ): Date {
        return new Date(
            currentDate.getTime() +
                expirationInSeconds * 1000 * (percentageOfLeaseUntilExpiration / 100)
        );
    }

    /**
     * Checks if the MongoDB Atlas credentials have expired.
     * @param {MongoDbCredentials} credentials - The MongoDB Atlas credentials.
     * @param {Date} currentDate - The current date (default: current system date).
     * @returns {boolean} - True if the credentials have expired, false otherwise.
     */
    static areMongoDbAtlasCredentialsExpired(
        credentials: MongoDbCredentials,
        currentDate: Date = new Date()
    ) {
        if (!credentials || !credentials?.expiration) return true;
        return currentDate >= credentials.expiration;
    }

    /**
     * Retrieves a Vault token using a Kubernetes JWT.
     * @param {VaultTokenParameters} parameters - The parameters for retrieving the Vault token.
     * @returns {Promise<string>} - A promise that resolves to the Vault token.
     */
    async getVaultTokenUsingKubernetesJwt(parameters: VaultTokenParameters): Promise<string> {
        this.logger.info(`Reading JWT from file location: ${parameters.jwtFileLocation}`);
        const kubernetesJwt = await readFile(parameters.jwtFileLocation, { encoding: 'utf-8' });
        this.logger.info(`JWT retrieved successfully starting with ${kubernetesJwt.slice(0, 4)}`);
        this.logger.info(
            `Vault config passed from entrypoint: namespace ${parameters.vaultNamespace}; url ${parameters.vaultUrl}`
        );
        let vaultToken: string;

        this.logger.info(`Use AWS Auth: ${parameters.useAwsAuth}`);

        if (parameters.useAwsAuth) {
            this.logger.info('Validating that the required environment variables have been set...');

            const REQUIRED_ENV_VARS = [
                'AWS_ROLE_ARN',
                'VAULT_AWS_AUTH_BACKEND',
                'VAULT_AWS_REGION',
                'VAULT_ADDR',
                'VAULT_NAMESPACE',
            ];
            this.logEnvVarStatus(REQUIRED_ENV_VARS);

            this.logger.info(
                'Getting Vault token using MPC CLI command: mpc vault perform-aws-auth'
            );
            try {
                const cliResponse = execSync('mpc vault perform-aws-auth', { encoding: 'utf-8' });
                vaultToken = String(cliResponse).trim();
            } catch (error) {
                this.logger.error('Error encountered while getting Vault token using AWS Auth.', {
                    error,
                });
                throw error;
            }
        } else {
            const vaultTokenResponse = await axios.post(
                parameters.vaultUrl,
                {
                    role: this.configService.get('VAULT_ROLE_NAME'),
                    jwt: kubernetesJwt,
                },
                {
                    headers: {
                        'X-Vault-Namespace': parameters.vaultNamespace,
                        'Content-Type': 'application/json',
                    },
                }
            );
            vaultToken = vaultTokenResponse.data.auth.client_token;
        }
        this.logger.info(
            `Vault token ${vaultToken ? '' : 'not '}retrieved successfully${
                vaultToken ? ` starting with ${vaultToken.slice(0, 4)}` : '.'
            }`
        );
        return vaultToken;
    }

    /**
     * Log whether required environment variables are set.
     * @param {string[]} requiredVars - list of env var names to check
     * @returns {void}
     */
    private logEnvVarStatus(requiredVars: string[]): void {
        // Build a compact status message for required env vars to avoid loop-style lint rules.
        const statusMessages = requiredVars.reduce<string[]>((acc, varName) => {
            const value = this.configService.get(varName);
            if (value) {
                acc.push(`${varName}=${value}`);
            } else {
                acc.push(`${varName}=<MISSING>`);
            }
            return acc;
        }, []);

        this.logger.info(`Env status: ${statusMessages.join(', ')}`);
    }

    /**
     * Pauses the execution for the specified number of milliseconds.
     * @param {number} ms - The number of milliseconds to wait.
     * @returns {Promise<void>} - A promise that resolves after the specified delay.
     */
    private static wait(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Retries a function with exponential backoff.
     * @param {() => Promise<T>} func - The function to retry.
     * @param {number} maxRetries - The maximum number of retries (default: 4).
     * @param {number} backoff - The initial backoff delay in milliseconds (default: 4000).
     * @returns {Promise<T>} - A promise that resolves with the result of the function.
     */
    private async retryWithBackoff<T>(
        func: () => Promise<T>,
        maxRetries = 4,
        backoff = 4000
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            func()
                .catch((e) =>
                    maxRetries === 0
                        ? Promise.reject(e)
                        : MongoRepository.wait(backoff).then(() =>
                              this.retryWithBackoff(func, maxRetries - 1, backoff * 2)
                          )
                )
                .then(resolve)
                .catch(reject);
        });
    }

    /**
     * Establishes the connection for passed database name.
     * if database name does not exist - initDb will automatically create collection and populate data into it.
     * @returns {Promise<Db>} promise of Database
     */
    async getDatabase(): Promise<Db> {
        const certificate = this.configService.get<string>('API_MONGO_DB_CERTIFICATE');

        // For MongoDB Atlas, you need to connect to Vault to get the latest database credentials
        // unless an active set of credentials are already present.
        // The Vault secret / environment variable AUTOMATICALLY_RENEW_MONGO_CREDENTIALS allows you
        // to disable this and use a manually obtained connection string for debugging
        if (
            this.isMongoDbAtlas &&
            MongoRepository.areMongoDbAtlasCredentialsExpired(this.mongoDbAtlasCredentials)
        ) {
            try {
                const vaultNamespace = this.configService.get('VAULT_NAMESPACE');
                const vaultUrl = new URL(this.configService.get('VAULT_URL'));
                const mongoDbAtlasVaultRole = this.configService.get('MONGODB_ATLAS_VAULT_ROLE');
                const useAwsAuth =
                    this.configService.get<string>('VAULT_USE_AWS_AUTH', 'false').toLowerCase() ===
                    'true';
                const vaultToken = await this.getVaultTokenUsingKubernetesJwt({
                    vaultNamespace,
                    vaultUrl: vaultUrl.href,
                    useAwsAuth,
                    jwtFileLocation: useAwsAuth
                        ? this.configService.get('AWS_WEB_IDENTITY_TOKEN_FILE')
                        : '/var/run/secrets/kubernetes.io/serviceaccount/token',
                });
                const mongoDbCredentialsResponse = await axios.get(
                    `${vaultUrl.origin}/v1/database/static-creds/${mongoDbAtlasVaultRole}`,
                    {
                        headers: {
                            'X-Vault-Token': vaultToken,
                            'X-Vault-Namespace': vaultNamespace,
                        },
                    }
                );

                this.mongoDbAtlasCredentials = {
                    username: mongoDbCredentialsResponse.data.data.username,
                    password: mongoDbCredentialsResponse.data.data?.password,
                    expiration: MongoRepository.setCredentialsExpirationDate(
                        mongoDbCredentialsResponse.data.lease_duration
                    ),
                };
                this.logger.info(
                    `MongoDB credentials${
                        this.mongoDbAtlasCredentials ? '' : ' not'
                    } retrieved successfully${
                        this.mongoDbAtlasCredentials
                            ? ` with username ${
                                  this.mongoDbAtlasCredentials.username
                              } and expiration ${this.mongoDbAtlasCredentials.expiration.toString()}`
                            : '.'
                    }`
                );

                this.mongoInstanceURL = MongoRepository.replaceMongoDbCredentialsInUrl(
                    this.mongoInstanceURL,
                    this.mongoDbAtlasCredentials.username,
                    this.mongoDbAtlasCredentials.password
                );
                this.logger.info(
                    `MongoDB URL updated with username ${this.mongoDbAtlasCredentials.username}`
                );
            } catch (error) {
                this.logger.error(
                    'Error encountered while getting MongoDB Atlas credentials from Vault.',
                    { error }
                );
                throw new Error(
                    'Error encountered while getting MongoDB Atlas credentials from Vault.'
                );
            }
        }

        try {
            if (this.database === undefined) {
                if (certificate && !this.isMongoDbAtlas) {
                    // The MongoClient requires the certificate to be in a file.
                    await this.createCertificateFile(certificate);
                }

                // Don't add the local MongoDB TLS certs for MongoDB Atlas - standard CA certs are fine
                const mongoClient = this.isMongoDbAtlas
                    ? new MongoClient(this.mongoInstanceURL)
                    : new MongoClient(this.mongoInstanceURL, {
                          ...(certificate && { tlsCAFile: this.MONGO_CERTIFICATE_PATH }),
                      });

                this.logger.info('Mongo client successfully created.');

                await this.retryWithBackoff(() => mongoClient.connect());

                this.logger.info('Connected to MongoDB Server.');

                this.database = await mongoClient.db();

                this.logger.info('Connected to MongoDB database.');

                // To verify whether the server is responding to commands.

                this.database.command({ ping: 1 });
                await this.initDb();

                return this.database;
            }
            return this.database;
        } catch (error) {
            this.logger.error(
                `Error encountered while establishing connection to [${this.databaseName}].`,
                { error }
            );
            throw new Error('Unable to establish connection to the database');
        }
    }

    /**
     * This method can be invoked by sub class that implements the repository to perform initial
     * checks on the database
     *
     */
    // eslint-disable-next-line class-methods-use-this
    initDb(): void {}

    /**
     * Gets the collection passed to it
     * @see https://stackoverflow.com/questions/10656574/how-do-i-manage-mongodb-connections-in-a-node-js-web-application
     *
     * This method adds a prefix of project-key before the collection name.
     * if PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY flag is enabled
     * @param {string} collectionName - the name of the collection to query from.
     * @returns {Promise<Collection>} - instance of MongoDB collection, which other functions can query from.
     */
    async getCollection<T>(collectionName): Promise<Collection<T>> {
        const newCollectionName =
            this.configService.get<string>('PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY') === 'true'
                ? `${PROJECT_NAME.toLowerCase()}_${collectionName}`
                : collectionName;
        return (await this.getDatabase()).collection<T>(newCollectionName);
    }
}
