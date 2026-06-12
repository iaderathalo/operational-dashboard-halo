import { beforeAll, expect, test } from '@jest/globals';
import supertest from 'supertest';

import { GetTasksResponse } from '@operational-dashboard/shared-api-model/model/tasks';

import { getClientCredentialsAuthToken } from './helper';
import { isLive } from './setup';

const { API_API_BASE_URL } = process.env;

let api;
let AUTH_TOKEN;
let request;

const tasksUrl = '/api/v1/tasks';

const taskName = `Task for E2E tests ${new Date().toISOString()}`;
let taskUrl: string;

/**
 * Captures the response object to see content-type has application/json.
 * @param {supertest.Response} response - Instance of Supertest response
 */
function checkResponseType(response: supertest.Response) {
    expect(response.get('Content-Type')).toBe('application/json; charset=utf-8');
}

beforeAll(async () => {
    AUTH_TOKEN = await getClientCredentialsAuthToken();
    const hook = (url, method) => (args) =>
        supertest(url)[method](args).set('Authorization', `BEARER ${AUTH_TOKEN}`);
    request = (url) => ({
        post: hook(url, 'post'),
        get: hook(url, 'get'),
        put: hook(url, 'put'),
        delete: hook(url, 'delete'),
        patch: hook(url, 'patch'),
    });
    api = request(API_API_BASE_URL);
});

test('creds should not be null', () => {
    expect(AUTH_TOKEN).toBeTruthy();
});

test('Smoke test', async () => {
    const live = await isLive();
    expect(live).toBe(true);
});

test('create a task', async () => {
    const response = await api
        .post(tasksUrl)
        .send({
            name: taskName,
            description: 'Initial description',
            priority: 100,
        })
        .set('Content-Type', 'application/json; charset=utf-8');
    expect(response.statusCode).toBe(201);

    taskUrl = response.get('Location');
    expect(taskUrl).toBeDefined();
    expect(taskUrl.startsWith(`${tasksUrl}/`)).toBeTruthy();
});

test('get all tasks and check that created task is present', async () => {
    const response = await api.get(tasksUrl);
    expect(response.statusCode).toBe(200);
    checkResponseType(response);

    const task = ((response.body as GetTasksResponse).tasks || []).find((t) => t.name === taskName);
    expect(task).toBeDefined();
});

test('update task', async () => {
    const response = await api
        .put(taskUrl)
        .send({
            id: taskUrl.slice(tasksUrl.length + 1), // Since taskUrl = `${tasksUrl}/${taskId}`
            description: 'Updated description',
            name: taskName,
            priority: 100,
        })
        .set('Content-Type', 'application/json; charset=utf-8');
    expect(response.statusCode).toBe(204);
});

test('get individual task and check that it was updated', async () => {
    const response = await api.get(taskUrl);
    expect(response.statusCode).toBe(200);
    checkResponseType(response);

    expect(response.body).toMatchObject({
        name: taskName,
        description: 'Updated description',
        priority: 100,
    });
});

test('delete task', async () => {
    const deleteResponse = await api.delete(taskUrl);
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await api.get(taskUrl);
    expect(getResponse.statusCode).toBe(404);
});
