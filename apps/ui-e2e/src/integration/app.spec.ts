import { getRGBString } from '@operational-dashboard/shared-utils-testing';
import '@operational-dashboard/shared-utils-cypress';

import { getFooter, getHeader, getMain, getTitle, getLogo } from '../support/app.po';
import { sampleTasks } from '../support/sampleTasks';

const branding = {
    colors: {
        header: getRGBString({
            r: 15,
            g: 33,
            b: 72,
        }),
        main: getRGBString({
            r: 244,
            g: 246,
            b: 249,
        }),
    },
    fonts: {
        primary: 'Noto-Sans',
    },
};

describe('starter-app', () => {
    beforeEach(() => {
        cy.intercept(
            {
                url: `**/*/${Cypress.env('API_NAME')}/v1/tasks`,
                method: 'GET',
            },
            { body: { tasks: sampleTasks } }
        ).as('getTasks');
        cy.visit('/home');
    });

    it('displays the application title', () => {
        getTitle().contains('Getting Started');
    });

    it('uses background colors adhering to branding', () => {
        getHeader().should('have.css', 'background-color', branding.colors.header);
        getMain().should('have.css', 'background-color', branding.colors.main);
        getFooter().should('not.exist');
    });

    it('uses a font family adhering to branding', () => {
        // Verify the layout elements have the font-family set.
        getHeader().should('have.css', 'font-family', branding.fonts.primary);
        getMain().should('have.css', 'font-family', branding.fonts.primary);
        getFooter().should('not.exist');

        // Verify individual text elements have the font-family set.
        getTitle().should('have.css', 'font-family', '"MMC Display-Condensed-Bold"');
    });

    it('displays the logo', () => {
        getLogo()
            .should('be.visible')
            .should('have.attr', 'src')
            .and('match', /mmc-logo.svg/);
    });

    it('should able to navigate to tasks when user clicks on tasklist', () => {
        cy.get('[data-cy=task-list]').click();
        cy.wait('@getTasks');
        cy.get('[data-cy=task-management]').should('be.visible');
    });
});
