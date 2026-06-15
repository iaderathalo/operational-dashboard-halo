import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import DashboardRoutingModule from './dashboard-routing.module';
import PortfolioPageComponent from './pages/portfolio-page/portfolio-page.component';

@NgModule({
    declarations: [PortfolioPageComponent],
    imports: [CommonModule, FormsModule, DashboardRoutingModule],
})
export default class DashboardModule {}
