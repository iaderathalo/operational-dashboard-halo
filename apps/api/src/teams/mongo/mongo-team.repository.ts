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

const toTeam = (team: Team & MongoDbId): Team => {
    const { _id: mongoId, ...rest } = team;
    return { ...rest, id: String(mongoId) };
};

const toContact = (contact: Contact & MongoDbId): Contact => {
    const { _id: mongoId, ...rest } = contact;
    return { ...rest, id: String(mongoId) };
};

@Injectable()
export default class MongoTeamRepository extends MongoRepository implements TeamRepository {
    teamsCollection = 'teams';

    contactsCollection = 'contacts';

    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    async findOne(teamId): Promise<Team> {
        const { _id: id } = teamId;
        const team = await (
            await this.getCollection<Team>(this.teamsCollection)
        ).findOne({ _id: ObjectId.createFromHexString(id) });

        return team ? toTeam(team as Team & MongoDbId) : null;
    }

    async findAll(): Promise<Team[]> {
        const teams = await (await this.getCollection<Team>(this.teamsCollection)).find().toArray();

        return teams.map((team) => toTeam(team as Team & MongoDbId));
    }

    async findContacts(teamId: string): Promise<Contact[]> {
        const contacts = await (await this.getCollection<Contact>(this.contactsCollection))
            .find({ teamId })
            .toArray();

        return contacts.map((contact) => toContact(contact as Contact & MongoDbId));
    }

    async findContactsByApplicationTeam(teamId: string): Promise<Contact[]> {
        return this.findContacts(teamId);
    }

    async updateOne(teamId, entity: Team): Promise<number> {
        const { _id: id } = teamId;
        const resp = await (
            await this.getCollection(this.teamsCollection)
        ).findOneAndReplace({ _id: ObjectId.createFromHexString(id) }, entity);
        return resp?._id ? 1 : 0;
    }

    async deleteOne(teamId): Promise<boolean> {
        const { _id: id } = teamId;
        const resp = await (
            await this.getCollection(this.teamsCollection)
        ).deleteOne({ _id: ObjectId.createFromHexString(id) });
        return Boolean(resp.deletedCount);
    }

    async create(team: Team): Promise<object> {
        const resp = await (
            await this.getCollection<Team>(this.teamsCollection)
        ).insertOne({ ...team });
        return resp.insertedId;
    }

    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.teamsCollection)).deleteMany({});
        return resp.deletedCount;
    }

    async initDb() {
        await this.initTeams();
        await this.initContacts();
    }

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
