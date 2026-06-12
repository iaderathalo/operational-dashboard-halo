import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
    DashboardDetailChannelOption,
    DashboardDetailPeople,
    DashboardDetailStatus,
    DashboardDetailView,
    DashboardDetailNotifyOption,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import {
    cloneCheckedItems,
    DETAIL_TABS,
    DetailTabId,
    HEALTH_STATUS_LABELS,
    ISSUE_TYPES,
    IssueType,
    PERCEPTION_STATUS_LABELS,
} from './detail-page.data';
import DashboardService from '../../services/dashboard.service';

@Component({
    selector: 'polaris-detail-page',
    templateUrl: './detail-page.component.html',
    styleUrls: ['./detail-page.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule],
})
/**
 * Renders the application detail experience that mirrors the prototype schema.
 */
export default class DetailPageComponent implements OnInit, OnDestroy {
    isLoading = true;

    loadError = '';

    activeTab: DetailTabId = 'overview';

    view!: DashboardDetailView;

    people!: DashboardDetailPeople;

    readonly tabs = DETAIL_TABS;

    readonly issueTypes = ISSUE_TYPES;

    readonly healthStatusLabels = HEALTH_STATUS_LABELS;

    readonly perceptionStatusLabels = PERCEPTION_STATUS_LABELS;

    readonly heatmapHours = Array.from({ length: 24 }, (_, hour) => hour);

    activeOverviewRange = '7d';

    activePerceptionRange = '24h';

    isSev1ModalOpen = false;

    modalStep = 1;

    selectedIssueType: IssueType = 'Availability / Outage';

    sev1Title = '';

    sev1Description = '';

    sev1NotifyOptions: DashboardDetailNotifyOption[] = [];

    sev1ChannelOptions: DashboardDetailChannelOption[] = [];

    expandedIncidents = new Set<string>();

    toastVisible = false;

    toastMessage = '';

    private toastTimeoutHandle?: ReturnType<typeof setTimeout>;

    /**
     * Creates the detail page component with route and navigation services.
     * @param {object} route Active route used to resolve the application id.
     * @param {object} router Router used for navigation back to the dashboard.
     * @param {object} dashboardService Service used to load detail context from the API.
     */
    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private dashboardService: DashboardService
    ) {}

    /**
     * Loads the routed application context and seeds the prototype-derived view model.
     */
    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id') || '';

        if (!id) {
            this.loadError = 'Application detail is unavailable.';
            this.isLoading = false;
            return;
        }

        this.loadDetail(id);
    }

    /**
     * Clears any pending toast timer when the component is destroyed.
     */
    ngOnDestroy(): void {
        if (this.toastTimeoutHandle) {
            clearTimeout(this.toastTimeoutHandle);
        }
    }

    /**
     * Switches the visible detail tab.
     * @param {string} tabId Tab identifier to activate.
     */
    setTab(tabId: DetailTabId): void {
        this.activeTab = tabId;
    }

    /**
     * Updates the selected range for the overview timeline controls.
     * @param {string} range Range label to mark as active.
     */
    setOverviewRange(range: string): void {
        this.activeOverviewRange = range;
    }

    /**
     * Updates the selected range for the perception trend controls.
     * @param {string} range Range label to mark as active.
     */
    setPerceptionRange(range: string): void {
        this.activePerceptionRange = range;
    }

    /**
     * Navigates back to the dashboard landing page.
     */
    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    /**
     * Maps a health or perception status code to the display label used in the UI.
     * @param {string} status Status code to convert.
     * @param {string} type Status family to look up.
     * @returns {string} Human-readable label for the supplied status.
     */
    statusLabel(status: DashboardDetailStatus, type: 'health' | 'perception' = 'health'): string {
        if (type === 'perception') {
            return this.perceptionStatusLabels[status];
        }

        return this.healthStatusLabels[status];
    }

    /**
     * Opens the Sev-1 workflow modal and resets it to the first step.
     */
    openSev1Modal(): void {
        this.isSev1ModalOpen = true;
        this.modalStep = 1;
    }

    /**
     * Closes the Sev-1 workflow modal.
     */
    closeSev1Modal(): void {
        this.isSev1ModalOpen = false;
    }

    /**
     * Advances the Sev-1 workflow to the next step.
     */
    nextModalStep(): void {
        if (this.modalStep < 3) {
            this.modalStep += 1;
        }
    }

    /**
     * Returns the Sev-1 workflow to the previous step.
     */
    previousModalStep(): void {
        if (this.modalStep > 1) {
            this.modalStep -= 1;
        }
    }

    /**
     * Stores the selected Sev-1 incident type.
     * @param {string} issueType Selected issue classification.
     */
    selectIssueType(issueType: IssueType): void {
        this.selectedIssueType = issueType;
    }

    /**
     * Expands or collapses an incident card in the incident timeline.
     * @param {string} title Incident title that keys the expanded state.
     */
    toggleIncident(title: string): void {
        if (this.expandedIncidents.has(title)) {
            this.expandedIncidents.delete(title);
            return;
        }

        this.expandedIncidents.add(title);
    }

    /**
     * Returns whether a given incident is currently expanded.
     * @param {string} title Incident title that keys the expanded state.
     * @returns {boolean} True when the incident card is expanded.
     */
    isIncidentExpanded(title: string): boolean {
        return this.expandedIncidents.has(title);
    }

    /**
     * Completes the Sev-1 workflow and shows a confirmation toast.
     */
    confirmSev1(): void {
        this.closeSev1Modal();
        this.showToast('Sev-1 INC-20260305-003 created successfully. Notifications sent.');
    }

    /**
     * Displays a temporary toast notification.
     * @param {string} message Toast message to display.
     */
    showToast(message: string): void {
        this.toastMessage = message;
        this.toastVisible = true;

        if (this.toastTimeoutHandle) {
            clearTimeout(this.toastTimeoutHandle);
        }

        this.toastTimeoutHandle = setTimeout(() => {
            this.toastVisible = false;
        }, 5000);
    }

    /**
     * Loads the routed application detail context from the dashboard API.
     * @param {string} id Portfolio application id from the route.
     */
    private loadDetail(id: string): void {
        this.isLoading = true;
        this.loadError = '';

        this.dashboardService.getPortfolioAppDetail(id).subscribe({
            next: (detail) => {
                this.view = detail.view;
                this.people = detail.people;
                this.sev1NotifyOptions = cloneCheckedItems(detail.people.sev1Notify);
                this.sev1ChannelOptions = cloneCheckedItems(detail.people.sev1Channels);
                this.updateIncidentDefaults();
                this.isLoading = false;
            },
            error: () => {
                this.loadError = 'Unable to load application detail.';
                this.isLoading = false;
            },
        });
    }

    /**
     * Refreshes the pre-filled Sev-1 workflow copy after the app context changes.
     */
    private updateIncidentDefaults(): void {
        this.sev1Title = `${this.view.name} — Incident`;
        this.sev1Description = `Users experiencing issues with ${this.view.name}.`;
    }

    /**
     * Counts the selected notification recipients in the Sev-1 workflow.
     * @returns {number} Number of checked recipient options.
     */
    selectedNotifyCount(): number {
        return this.sev1NotifyOptions.filter((option) => option.checked).length;
    }

    /**
     * Counts the selected notification channels in the Sev-1 workflow.
     * @returns {number} Number of checked notification channels.
     */
    selectedChannelCount(): number {
        return this.sev1ChannelOptions.filter((option) => option.checked).length;
    }

    /**
     * Computes the SVG stroke offset for the perception gauge.
     * @returns {number} Stroke dash offset for the current perception score.
     */
    perceptionGaugeOffset(): number {
        return Number((235.6 * (1 - this.view.perceptionScore / 100)).toFixed(1));
    }
}
