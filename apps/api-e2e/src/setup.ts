/* eslint-disable no-await-in-loop, no-console */
import axios, { AxiosResponse, AxiosError } from 'axios';

const tasksUrl = '/api/v1/tasks';

const { API_API_BASE_URL } = process.env;

/**
 * sleep - returns a promise that is resolved after a specified time period.
 * @param {number} ms - time in milliseconds
 * @returns {Promise<void>} - promise that is resolved after the specified time
 */
function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * A promise that returns a boolean indicating if the API is live
 * @returns {Promise<boolean>} - promise that returns true if the API is live, false otherwise
 */
export async function isLive(): Promise<boolean> {
    try {
        const response = (await axios.get(`${API_API_BASE_URL}${tasksUrl}`)) as AxiosResponse;
        console.info(`API response is ${JSON.stringify(response.data)}`);
        return response.data.tasks.length > 0;
    } catch (e) {
        // 401 indicates that the API is operational but is protected by Auth.
        return (e as AxiosError).response?.status === 401;
    }
}

/**
 * setup - attempts to setup the service by repeatedly checking if the API is live.
 * If the service never comes up, exits the process with an error code.
 * @returns {Promise<void>} - promise that is resolved when the function completes.
 */
export default async function setup() {
    try {
        let retries = 0;
        const maxRetries = 10;
        console.info(`Checking if ${API_API_BASE_URL}${tasksUrl} is live`);
        while (!(await isLive()) && retries <= maxRetries) {
            console.info(`Not live, sleeping and retrying - ${retries} of ${maxRetries}`);
            retries += 1;
            await sleep(10000);
        }
        if (retries >= maxRetries && !(await isLive())) {
            console.error('Service never came up, exiting');
            process.exit(1);
        }
    } catch (e) {
        console.error(`Error setting up: ${JSON.parse(e)}`);
        process.exit(1);
    }
}
