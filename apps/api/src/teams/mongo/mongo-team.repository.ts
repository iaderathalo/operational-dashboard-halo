/* eslint-disable no-underscore-dangle */
import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { SEED_CONTACTS, SEED_TEAMS } from '../seed/teams.seed';
import { TeamRepository } from '../team.repository';

type MongoDbId = Record<'_id', ObjectId | string>;

type TeamDocument = Team & MongoDbId & { slackChannel?: string };

const toTeam = (team: TeamDocument): Team => {
    const { _id: mongoId, slackChannel, teamsChannel, ...rest } = team;

    return {
        ...rest,
        id: String(mongoId),
        teamsChannel: teamsChannel ?? slackChannel,
    };
};

const toContact = (contact: Contact & MongoDbId): Contact => {
    const { _id: mongoId, ...rest } = contact;
    return { ...rest, id: String(mongoId) };
};

@Injectable()
export default class MongoTeamRepository extends MongoRepository implements TeamRepository {
    teamsCollection = 'teams';

    contactsCollection = 'contacts';

    /**
     * Creates the Mongo-backed team repository.
     * @param {object} configService - configuration service for database settings
     * @param {object} logger - logger used for repository diagnostics
     */
    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    /**
     * Finds a single team by identifier.
     * @param {{ _id: string }} teamId - wrapped team identifier
     * @returns {Promise<object>} matching team, if found
     */
    async findOne(teamId): Promise<Team> {
        const { _id: id } = teamId;
        const team = await (
            await this.getCollection<Team>(this.teamsCollection)
        ).findOne({ _id: ObjectId.createFromHexString(id) });

        return team ? toTeam(team as TeamDocument) : null;
    }

    /**
     * Returns all teams.
     * @returns {Promise<object[]>} all stored teams
     */
    async findAll(): Promise<Team[]> {
        const teams = await (await this.getCollection<Team>(this.teamsCollection)).find().toArray();

        return teams.map((team) => toTeam(team as TeamDocument));
    }

    /**
     * Returns contacts for a team.
     * @param {string} teamId - team identifier
     * @returns {Promise<object[]>} contacts assigned to the team
     */
    async findContacts(teamId: string): Promise<Contact[]> {
        const contacts = await (await this.getCollection<Contact>(this.contactsCollection))
            .find({ teamId })
            .toArray();

        return contacts.map((contact) => toContact(contact as Contact & MongoDbId));
    }

    /**
     * Returns contacts for an application team.
     * @param {string} teamId - application team identifier
     * @returns {Promise<object[]>} contacts assigned to the team
     */
    async findContactsByApplicationTeam(teamId: string): Promise<Contact[]> {
        return this.findContacts(teamId);
    }

    /**
     * Replaces a stored team.
     * @param {{ _id: string }} teamId - wrapped team identifier
     * @param {object} entity - replacement team payload
     * @returns {Promise<number>} 1 when the team was updated, otherwise 0
     */
    async updateOne(teamId, entity: Team): Promise<number> {
        const { _id: id } = teamId;
        const resp = await (
            await this.getCollection(this.teamsCollection)
        ).findOneAndReplace({ _id: ObjectId.createFromHexString(id) }, entity);
        return resp?._id ? 1 : 0;
    }

    /**
     * Deletes a stored team.
     * @param {{ _id: string }} teamId - wrapped team identifier
     * @returns {Promise<boolean>} true when the team was deleted
     */
    async deleteOne(teamId): Promise<boolean> {
        const { _id: id } = teamId;
        const resp = await (
            await this.getCollection(this.teamsCollection)
        ).deleteOne({ _id: ObjectId.createFromHexString(id) });
        return Boolean(resp.deletedCount);
    }

    /**
     * Creates a team.
     * @param {object} team - team payload to create
     * @returns {Promise<object>} inserted Mongo identifier
     */
    async create(team: Team): Promise<object> {
        const resp = await (
            await this.getCollection<Team>(this.teamsCollection)
        ).insertOne({ ...team });
        return resp.insertedId;
    }

    /**
     * Deletes all teams.
     * @returns {Promise<number>} number of removed team documents
     */
    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.teamsCollection)).deleteMany({});
        return resp.deletedCount;
    }

    /**
     *
     */
    async initDb() {
        await this.initTeams();
        await this.initContacts();
    }

    /**
     *
     */
    private async initTeams() {
        const collections = await this.database.listCollections().toArray();
        if (!collections.find((c) => c.name === this.teamsCollection)) {
            await this.database.createCollection(this.teamsCollection);
        }
        const collection = await this.getCollection<Team>(this.teamsCollection);
        const count = await collection.countDocuments();
        if (count === 0) {
            this.logger.info(`Seeding [${this.teamsCollection}]`);
            await collection.insertMany(SEED_TEAMS as Team[]);
        }
    }

    /**
     *
     */
    private async initContacts() {
        const collections = await this.database.listCollections().toArray();
        if (!collections.find((c) => c.name === this.contactsCollection)) {
            await this.database.createCollection(this.contactsCollection);
        }
        const collection = await this.getCollection<Contact>(this.contactsCollection);
        const count = await collection.countDocuments();
        if (count === 0) {
            this.logger.info(`Seeding [${this.contactsCollection}]`);
            await collection.insertMany(SEED_CONTACTS as Contact[]);
        }
    }
}
