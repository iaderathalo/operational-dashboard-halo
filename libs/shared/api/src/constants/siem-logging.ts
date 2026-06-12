/**
 * Constants related to SIEM logging to ensure consistency in the values used across the codebase.
 */

export enum IdentityProvider {
    OKTA = 'Okta',
}

export enum AuthenticationChannel {
    SSO = 'SSO',
    OAUTH = 'OAUTH',
}

export enum ApplicationComponent {
    OKTA_GUARD = 'OktaGuard',
    TASKS_SERVICE = 'TasksService',
}
