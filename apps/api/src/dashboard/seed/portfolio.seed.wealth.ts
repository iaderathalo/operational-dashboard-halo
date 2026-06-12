import { PortfolioNode } from '../portfolio.model';
import createApp from './portfolio.seed.shared';

const WEALTH_PORTFOLIO_NODE: PortfolioNode = {
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
};

export default WEALTH_PORTFOLIO_NODE;
