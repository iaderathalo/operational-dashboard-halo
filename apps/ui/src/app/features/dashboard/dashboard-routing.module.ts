import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import DetailPageComponent from './pages/detail-page/detail-page.component';
import FiringMonitorsPageComponent from './pages/firing-monitors-page/firing-monitors-page.component';
import PortfolioPageComponent from './pages/portfolio-page/portfolio-page.component';
import SloPageComponent from './pages/slo-page/slo-page.component';
import SyntheticsPageComponent from './pages/synthetics-page/synthetics-page.component';

const routes: Routes = [
    { path: '', component: PortfolioPageComponent },
    { path: 'app/:id', component: DetailPageComponent },
    { path: 'slo', component: SloPageComponent },
    { path: 'synthetics', component: SyntheticsPageComponent },
    { path: 'monitors', component: FiringMonitorsPageComponent },
    { path: 'snapshot', component: PortfolioPageComponent, data: { readOnly: true } },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export default class DashboardRoutingModule {}
