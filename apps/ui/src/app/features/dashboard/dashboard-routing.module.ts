import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import DetailPageComponent from './pages/detail-page/detail-page.component';
import PortfolioPageComponent from './pages/portfolio-page/portfolio-page.component';

const routes: Routes = [
    { path: '', component: PortfolioPageComponent },
    { path: 'app/:id', component: DetailPageComponent },
    // 11-4: read-only shareable snapshot view; reuses the portfolio page in read-only
    // mode driven by route data so there is no new visual language.
    { path: 'snapshot', component: PortfolioPageComponent, data: { readOnly: true } },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export default class DashboardRoutingModule {}
