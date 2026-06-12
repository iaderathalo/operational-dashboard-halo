import { PortfolioNode } from '../portfolio.model';
import createApp from './portfolio.seed.shared';

const HEALTH_PORTFOLIO_NODE: PortfolioNode = {
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
};

export default HEALTH_PORTFOLIO_NODE;
