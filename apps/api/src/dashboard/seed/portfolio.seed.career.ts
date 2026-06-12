import { PortfolioNode } from '../portfolio.model';
import createApp from './portfolio.seed.shared';

const CAREER_PORTFOLIO_NODE: PortfolioNode = {
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
};

export default CAREER_PORTFOLIO_NODE;
