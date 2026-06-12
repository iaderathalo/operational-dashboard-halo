import axios, { AxiosResponse } from 'axios';

const basicAuthHeader = (username, password) =>
    `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

export const getClientCredentialsAuthToken = async () => {
    const body = new URLSearchParams();
    const { APIGEE_CLIENT_ID, APIGEE_SECRET, APIGEE_ORGANIZATION } = process.env;

    body.append('grant_type', 'client_credentials');
    const {
        data: { access_token: accessToken },
    } = (await axios.post(
        `https://${APIGEE_ORGANIZATION}-ingress.mgti.mmc.com/authentication/v1/oauth2/token`,
        body,
        {
            headers: {
                Authorization: basicAuthHeader(APIGEE_CLIENT_ID, APIGEE_SECRET),
            },
        }
    )) as AxiosResponse;

    return accessToken;
};

export default { getClientCredentialsAuthToken };
