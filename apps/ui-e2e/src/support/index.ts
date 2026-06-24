// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';

// The global stylesheet pulls in Google Fonts via a remote `@import`
// (libs/shared/styles/app/_main.scss). CI runners have no external egress, so
// that stylesheet never finishes downloading and the page never fires its
// `load` event — making every `cy.visit` time out. The app already self-hosts
// Noto Sans from /assets/fonts, so we stub the remote request with empty CSS to
// let the page load. Registered here so it applies before every spec's visit.
beforeEach(() => {
    cy.intercept('https://fonts.googleapis.com/**', {
        statusCode: 200,
        headers: { 'content-type': 'text/css' },
        body: '',
    });
});
