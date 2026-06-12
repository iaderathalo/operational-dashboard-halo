/* eslint-disable no-template-curly-in-string */
const unresolvedPlaceholderPattern = /^\$\{\{\s*[A-Z0-9_]+\s*\}\}$/;
const currentOrigin = window.location.origin;
const localOktaConfig = {
    clientId: 'uw57oNG4XPi8IiMnYJJ0uMaWHQAcZY3mhGobmiuxXKGW2NQ5',
    issuer: 'https://mmc-bedford-int-non-prod-ingress.mgti.mmc.com/authentication/v1',
    redirectUri: `${currentOrigin}/login/callback`,
    scopes: [],
    pkce: true,
    postLogoutUri: currentOrigin,
};

function isUnresolvedPlaceholder(value: string): boolean {
    return unresolvedPlaceholderPattern.test(value);
}

function parseRuntimeJson<T>(value: string, fallback: T): T {
    if (isUnresolvedPlaceholder(value)) {
        return fallback;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function resolveRuntimeString(value: string, fallback: string): string {
    return isUnresolvedPlaceholder(value) ? fallback : value;
}

// Vault stores the Okta config object as a string so we need to explicitly construct the object and Boolean values
const rawOktaConfig = '${{ UI_OKTA_CONFIG_ANGULAR }}';
const isLocalRuntimeConfig = isUnresolvedPlaceholder(rawOktaConfig);
const oktaConfig = parseRuntimeJson(rawOktaConfig, localOktaConfig);
const production = true;
const baseUrl = new URL(oktaConfig.redirectUri);

baseUrl.protocol = window.location.protocol;
baseUrl.hostname = window.location.hostname;
baseUrl.port = window.location.port;
oktaConfig.redirectUri = baseUrl.href;
oktaConfig.postLogoutUri = currentOrigin;
const environment = {
    appVersion: resolveRuntimeString('${{ UI_APP_VERSION }}', '0.0.1'),
    production,
    bypassAuth: false,
    apiBaseUrl: resolveRuntimeString(
        '${{ UI_API_BASE_URL }}',
        `${window.location.protocol}//${window.location.hostname}:8080/api/v1`
    ),
    oktaConfig,
};

export default environment;
