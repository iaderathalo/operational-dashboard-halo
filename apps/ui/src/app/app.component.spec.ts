import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { OKTA_CONFIG, OktaAuthModule } from '@okta/okta-angular';

import { queryForElement } from '@operational-dashboard/shared-utils-testing';

import AppComponent from './app.component';
import SharedModule from './shared/shared.module';

describe('AppComponent', () => {
    const oktaAuth = {
        getUser: jest.fn().mockResolvedValue({
            name: 'Anton Novikov',
            email: 'anton.novikov02@marsh.com',
            preferred_username: 'anton.novikov02@marsh.com',
        }),
        getAccessToken: jest.fn().mockReturnValue(''),
    };

    beforeEach(async () => {
        oktaAuth.getUser.mockClear();
        oktaAuth.getAccessToken.mockClear();
        oktaAuth.getUser.mockResolvedValue({
            name: 'Anton Novikov',
            email: 'anton.novikov02@marsh.com',
            preferred_username: 'anton.novikov02@marsh.com',
        });

        await TestBed.configureTestingModule({
            imports: [RouterTestingModule, OktaAuthModule, SharedModule, HttpClientTestingModule],
            declarations: [AppComponent],
            providers: [{ provide: OKTA_CONFIG, useValue: { oktaAuth } }],
        }).compileComponents();
    });

    it('should create the app', () => {
        const fixture = TestBed.createComponent(AppComponent);
        const app = fixture.componentInstance;
        expect(app).toBeTruthy();
    });

    it('should expose the Portfolio Visibility Dashboard title', () => {
        const fixture = TestBed.createComponent(AppComponent);
        const app = fixture.componentInstance;
        expect(app.title).toBe('Portfolio Visibility Dashboard');
        expect(app.dashboardTitle).toBe('Portfolio Visibility Dashboard');
    });

    it('should load the authenticated user into the header', async () => {
        const fixture = TestBed.createComponent(AppComponent);
        await fixture.whenStable();

        const app = fixture.componentInstance;
        expect(app.headerUserName).toBe('Anton Novikov');
        expect(app.headerUserEmail).toBe('anton.novikov02@marsh.com');
        expect(app.headerUserInitials).toBe('AN');
    });

    it('should correctly inject the okta dependency from the injection token', () => {
        const testOktaAuth = TestBed.inject(OKTA_CONFIG);
        const fixture = TestBed.createComponent(AppComponent);
        const oktaAuthDependency = fixture.debugElement.injector.get(OKTA_CONFIG);

        expect(oktaAuthDependency).toBeTruthy();
        expect(oktaAuthDependency).toBe(testOktaAuth);
    });

    it('should display API internal error', () => {
        const fixture = TestBed.createComponent(AppComponent);
        fixture.componentInstance.apiError = true;
        fixture.detectChanges();
        const compiled = fixture.nativeElement as HTMLElement;
        const errorBanner = queryForElement<HTMLDivElement>(compiled, '.main__api_error');
        expect(errorBanner).toBeTruthy();
        expect(errorBanner?.textContent).toContain('Tasks API error');
    });

    it('should display API unreachable error', () => {
        const fixture = TestBed.createComponent(AppComponent);
        fixture.componentInstance.apiUnreachable = true;
        fixture.detectChanges();
        const compiled = fixture.nativeElement as HTMLElement;
        const errorBanner = queryForElement<HTMLDivElement>(compiled, '.main__api_error');
        expect(errorBanner).toBeTruthy();
        expect(errorBanner?.textContent).toContain('Tasks API is unreachable');
    });

    it('should omit the redundant dashboard breadcrumb on the root dashboard view', () => {
        const fixture = TestBed.createComponent(AppComponent);
        fixture.componentInstance.isDashboardRoute = true;
        fixture.componentInstance.headerDetailLabel = '';
        fixture.detectChanges();

        const compiled = fixture.nativeElement as HTMLElement;
        const headerTrail = compiled.querySelector<HTMLSpanElement>('.header-trail');

        expect(headerTrail).toBeNull();
    });

    it('should show only the detail label after the dashboard title', () => {
        const fixture = TestBed.createComponent(AppComponent);
        fixture.componentInstance.isDashboardRoute = true;
        fixture.componentInstance.headerDetailLabel = 'Mercer FIBER';
        fixture.detectChanges();

        const compiled = fixture.nativeElement as HTMLElement;
        const headerTrail = queryForElement<HTMLSpanElement>(compiled, '.header-trail');

        expect(headerTrail?.textContent?.replace(/\s+/g, ' ').trim()).toBe('/ Mercer FIBER');
        expect(compiled.textContent).not.toContain('/ Dashboard / Mercer FIBER');
    });

    it('should show profile information in the header dropdown', () => {
        const fixture = TestBed.createComponent(AppComponent);
        fixture.componentInstance.isDashboardRoute = true;
        fixture.componentInstance.headerUserName = 'Anton Novikov';
        fixture.componentInstance.headerUserEmail = 'anton.novikov02@marsh.com';
        fixture.componentInstance.headerUserUsername = 'anton.novikov02@marsh.com';
        fixture.componentInstance.headerUserRole = 'TPM';
        fixture.componentInstance.headerUserInitials = 'AN';
        fixture.componentInstance.isProfileMenuOpen = true;
        fixture.detectChanges();

        const compiled = fixture.nativeElement as HTMLElement;
        const profileMenu = queryForElement<HTMLDivElement>(compiled, '.header-profile-menu');

        expect(profileMenu.textContent).toContain('Anton Novikov');
        expect(profileMenu.textContent).toContain('anton.novikov02@marsh.com');
        expect(profileMenu.textContent).toContain('TPM');
    });
});
