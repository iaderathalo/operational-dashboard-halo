import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { Task } from '@operational-dashboard/shared-api-model/model/tasks';

import { TaskRepository } from '../task.repository';

@Injectable()
export default class InMemoryTaskRepository implements TaskRepository {
    private tasks: Task[] = [
        {
            id: uuidv4(),
            name: 'Configure monitoring alerts',
            description: 'Set up Datadog alerts for all Tier 1 applications',
            priority: 1,
        },
        {
            id: uuidv4(),
            name: 'Review incident postmortem',
            description: 'Complete post-incident review for SAP ERP outage',
            priority: 2,
        },
    ];

    async findOne(idObj: object): Promise<Task> {
        const { _id: id } = idObj as { _id: string };
        return this.tasks.find((t) => t.id === id) || null;
    }

    async findAll(): Promise<Task[]> {
        return [...this.tasks];
    }

    async updateOne(idObj: object, entity: Task): Promise<number> {
        const { _id: id } = idObj as { _id: string };
        const index = this.tasks.findIndex((t) => t.id === id);
        if (index === -1) return 0;
        this.tasks[index] = { ...entity, id };
        return 1;
    }

    async deleteOne(idObj: object): Promise<boolean> {
        const { _id: id } = idObj as { _id: string };
        const index = this.tasks.findIndex((t) => t.id === id);
        if (index === -1) return false;
        this.tasks.splice(index, 1);
        return true;
    }

    async create(entity: Task): Promise<string> {
        const id = uuidv4();
        this.tasks.push({ ...entity, id });
        return id;
    }

    async deleteAll(): Promise<number> {
        const count = this.tasks.length;
        this.tasks = [];
        return count;
    }
}
