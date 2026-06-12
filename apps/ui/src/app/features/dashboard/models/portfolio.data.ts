/* eslint-disable max-lines */
import { PortfolioApp, PortfolioNode } from './portfolio.model';

const createApp = (
    id: string,
    name: string,
    health: PortfolioApp['health'],
    perception: PortfolioApp['perception'],
    uptime: number,
    users: number,
    incidents: number,
    lastIncident: string
): PortfolioApp => ({
    id,
    name,
    health,
    perception,
    uptime,
    users,
    incidents,
    lastIncident,
});

export const PORTFOLIO_DATA: PortfolioNode = {
    id: 'root',
    name: 'All Portfolios',
    role: 'COO',
    owner: 'Rami Assaad',
    children: [
        {
            id: 'bu1',
            name: 'Health',
            role: 'Delivery Lead',
            owner: 'Jorie Blackwell',
            children: [
                {
                    id: 'bu1-ea',
                    name: 'US Consulting',
                    role: 'TPM',
                    owner: 'Anton Novikov',
                    children: [],
                    apps: [
                        createApp(
                            'bu1-ea-mercer-fiber',
                            'Mercer FIBER',
                            'green',
                            'amber',
                            99.88,
                            310,
                            1,
                            '12 days ago'
                        ),
                        createApp(
                            'bu1-ea-mercer-beacon',
                            'Mercer Beacon',
                            'green',
                            'green',
                            99.92,
                            150,
                            0,
                            '45 days ago'
                        ),
                        createApp(
                            'bu1-ea-mercer-intellify',
                            'Mercer Intellify',
                            'green',
                            'green',
                            99.91,
                            14500,
                            0,
                            '9 days ago'
                        ),
                        createApp(
                            'bu1-ea-mercer-vip',
                            'Mercer VIP',
                            'green',
                            'green',
                            99.88,
                            680,
                            0,
                            '22 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu1-cs',
                    name: 'Gov Health',
                    role: 'TPM',
                    owner: 'Eric Wolf',
                    children: [],
                    apps: [
                        createApp(
                            'bu1-cs-crm-suite',
                            'CRM Suite',
                            'green',
                            'green',
                            99.96,
                            2100,
                            0,
                            '18 days ago'
                        ),
                        createApp(
                            'bu1-cs-customer-portal',
                            'Customer Portal',
                            'green',
                            'green',
                            99.91,
                            14500,
                            0,
                            '9 days ago'
                        ),
                        createApp(
                            'bu1-cs-support-ticketing',
                            'Support Ticketing',
                            'green',
                            'green',
                            99.88,
                            680,
                            0,
                            '22 days ago'
                        ),
                        createApp(
                            'bu1-cs-email-marketing',
                            'Email Marketing',
                            'amber',
                            'amber',
                            99.3,
                            340,
                            2,
                            '3 days ago'
                        ),
                        createApp(
                            'bu1-cs-chat-bot',
                            'Chat Bot',
                            'green',
                            'green',
                            99.94,
                            8200,
                            0,
                            '28 days ago'
                        ),
                        createApp(
                            'bu1-cs-feedback-collector',
                            'Feedback Collector',
                            'green',
                            'green',
                            99.99,
                            4500,
                            0,
                            '60 days ago'
                        ),
                        createApp(
                            'bu1-cs-loyalty-platform',
                            'Loyalty Platform',
                            'green',
                            'green',
                            99.87,
                            9300,
                            0,
                            '15 days ago'
                        ),
                    ],
                },
            ],
            apps: [],
        },
        {
            id: 'bu2',
            name: 'Wealth',
            role: 'VP',
            owner: 'James Wilson',
            children: [
                {
                    id: 'bu2-infra',
                    name: 'OCIO',
                    role: 'Director',
                    owner: 'Tom Brown',
                    children: [],
                    apps: [
                        createApp(
                            'bu2-infra-cloud-manager',
                            'Cloud Manager',
                            'green',
                            'green',
                            99.98,
                            120,
                            0,
                            '35 days ago'
                        ),
                        createApp(
                            'bu2-infra-dns-services',
                            'DNS Services',
                            'green',
                            'green',
                            99.999,
                            50,
                            0,
                            '120 days ago'
                        ),
                        createApp(
                            'bu2-infra-load-balancer',
                            'Load Balancer',
                            'green',
                            'green',
                            99.97,
                            35,
                            0,
                            '60 days ago'
                        ),
                        createApp(
                            'bu2-infra-kubernetes-cluster',
                            'Kubernetes Cluster',
                            'green',
                            'green',
                            99.95,
                            90,
                            0,
                            '14 days ago'
                        ),
                        createApp(
                            'bu2-infra-cicd-pipeline',
                            'CI/CD Pipeline',
                            'amber',
                            'amber',
                            99.1,
                            210,
                            1,
                            '5 days ago'
                        ),
                        createApp(
                            'bu2-infra-container-registry',
                            'Container Registry',
                            'green',
                            'green',
                            99.99,
                            180,
                            0,
                            '45 days ago'
                        ),
                        createApp(
                            'bu2-infra-secrets-vault',
                            'Secrets Vault',
                            'green',
                            'green',
                            99.999,
                            75,
                            0,
                            '90 days ago'
                        ),
                        createApp(
                            'bu2-infra-monitoring-stack',
                            'Monitoring Stack',
                            'green',
                            'green',
                            99.96,
                            140,
                            0,
                            '20 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu2-ds',
                    name: 'Advisory',
                    role: 'Director',
                    owner: 'Amy Lee',
                    children: [],
                    apps: [
                        createApp(
                            'bu2-ds-web-cms',
                            'Web CMS',
                            'green',
                            'green',
                            99.93,
                            520,
                            0,
                            '25 days ago'
                        ),
                        createApp(
                            'bu2-ds-mobile-backend',
                            'Mobile Backend',
                            'green',
                            'green',
                            99.89,
                            45000,
                            0,
                            '10 days ago'
                        ),
                        createApp(
                            'bu2-ds-push-notifications',
                            'Push Notifications',
                            'green',
                            'green',
                            99.97,
                            38000,
                            0,
                            '30 days ago'
                        ),
                        createApp(
                            'bu2-ds-cdn-service',
                            'CDN Service',
                            'green',
                            'green',
                            99.99,
                            150,
                            0,
                            '55 days ago'
                        ),
                        createApp(
                            'bu2-ds-search-engine',
                            'Search Engine',
                            'green',
                            'green',
                            99.91,
                            22000,
                            0,
                            '8 days ago'
                        ),
                        createApp(
                            'bu2-ds-recommendation-api',
                            'Recommendation API',
                            'green',
                            'green',
                            99.85,
                            18000,
                            0,
                            '12 days ago'
                        ),
                        createApp(
                            'bu2-ds-ab-testing',
                            'A/B Testing',
                            'green',
                            'green',
                            99.94,
                            300,
                            0,
                            '40 days ago'
                        ),
                        createApp(
                            'bu2-ds-feature-flags',
                            'Feature Flags',
                            'green',
                            'green',
                            99.98,
                            250,
                            0,
                            '50 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu3-ret',
                    name: 'Retirement',
                    role: 'Director',
                    owner: 'John Doe',
                    children: [],
                    apps: [
                        createApp(
                            'bu3-ret-retirement-studo',
                            'Retirement Studo',
                            'green',
                            'green',
                            99.99,
                            131,
                            0,
                            '180 days ago'
                        ),
                        createApp(
                            'bu3-ret-retiree-app',
                            'Retiree App',
                            'green',
                            'green',
                            99.91,
                            22000,
                            0,
                            '260 days ago'
                        ),
                    ],
                },
            ],
            apps: [],
        },
        {
            id: 'bu4',
            name: 'Career',
            role: 'VP',
            owner: 'James Wilson',
            children: [
                {
                    id: 'bu4-rwds',
                    name: 'Rewards',
                    role: 'Director',
                    owner: 'Tom Brown',
                    children: [],
                    apps: [
                        createApp(
                            'bu4-rwds-your-rewards',
                            'Your Rewards',
                            'green',
                            'green',
                            99.98,
                            120,
                            0,
                            '35 days ago'
                        ),
                        createApp(
                            'bu4-rwds-benefits-manager',
                            'Benefits Manager',
                            'green',
                            'green',
                            99.999,
                            50,
                            0,
                            '120 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu4-mobility',
                    name: 'Mobility',
                    role: 'Director',
                    owner: 'Amy Lee',
                    children: [],
                    apps: [
                        createApp(
                            'bu4-mobility-mobile-backend',
                            'Mobile Backend',
                            'green',
                            'green',
                            99.89,
                            45000,
                            0,
                            '10 days ago'
                        ),
                        createApp(
                            'bu4-mobility-push-notifications',
                            'Push Notifications',
                            'green',
                            'green',
                            99.97,
                            38000,
                            0,
                            '30 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu4-talent',
                    name: 'Talent',
                    role: 'Director',
                    owner: 'John Doe',
                    children: [],
                    apps: [
                        createApp(
                            'bu4-talent-retirement-studo',
                            'Retirement Studo',
                            'green',
                            'green',
                            99.99,
                            131,
                            0,
                            '180 days ago'
                        ),
                        createApp(
                            'bu4-talent-retiree-app',
                            'Retiree App',
                            'green',
                            'green',
                            99.91,
                            22000,
                            0,
                            '260 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu4-communications',
                    name: 'Communitcations',
                    role: 'Director',
                    owner: 'Mike Bush',
                    children: [],
                    apps: [
                        createApp(
                            'bu4-communications-email-studio',
                            'Email Studio',
                            'green',
                            'green',
                            99.98,
                            343,
                            0,
                            '98 days ago'
                        ),
                        createApp(
                            'bu4-communications-customer-chat',
                            'Customer Chat',
                            'green',
                            'green',
                            99.91,
                            22000,
                            0,
                            '260 days ago'
                        ),
                    ],
                },
                {
                    id: 'bu4-content',
                    name: 'Content and Publications',
                    role: 'Director',
                    owner: 'Victoria Smith',
                    children: [],
                    apps: [
                        createApp(
                            'bu4-content-content-studio',
                            'Content Studio',
                            'green',
                            'green',
                            99.99,
                            131,
                            0,
                            '156 days ago'
                        ),
                        createApp(
                            'bu4-content-pdf-publisher',
                            'PDF Publisher',
                            'green',
                            'green',
                            99.91,
                            98,
                            0,
                            '361 days ago'
                        ),
                    ],
                },
            ],
            apps: [],
        },
        {
            id: 'bu5',
            name: 'Enterprise and Corporate',
            role: 'VP',
            owner: 'Maria Garcia',
            children: [],
            apps: [
                createApp(
                    'bu5-service-now',
                    'Service Now',
                    'red',
                    'red',
                    96.8,
                    28000,
                    3,
                    '45 min ago'
                ),
                createApp('bu5-workday', 'Workday', 'amber', 'amber', 99.2, 3200, 0, '1 day ago'),
                createApp(
                    'bu5-sharepoint',
                    'Sharepoint',
                    'green',
                    'green',
                    99.87,
                    890,
                    0,
                    '18 days ago'
                ),
                createApp(
                    'bu5-ms-teams',
                    'MS Teams',
                    'green',
                    'green',
                    99.93,
                    15000,
                    0,
                    '22 days ago'
                ),
            ],
        },
    ],
    apps: [],
};

export default PORTFOLIO_DATA;
