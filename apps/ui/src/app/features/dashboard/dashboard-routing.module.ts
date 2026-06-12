import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import DetailPageComponent from './pages/detail-page/detail-page.component';
import PortfolioPageComponent from './pages/portfolio-page/portfolio-page.component';

const routes: Routes = [
    { path: '', component: PortfolioPageComponent },
    { path: 'app/:id', component: DetailPageComponent },
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export default class DashboardRoutingModule {}
