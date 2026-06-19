import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import DashboardRoutingModule from './dashboard-routing.module';
import PortfolioPageComponent from './pages/portfolio-page/portfolio-page.component';
import FormatActiveUsersPipe from './pipes/format-active-users.pipe';
import FormatUptimePipe from './pipes/format-uptime.pipe';

@NgModule({
    declarations: [PortfolioPageComponent, FormatUptimePipe, FormatActiveUsersPipe],
    imports: [CommonModule, FormsModule, DashboardRoutingModule],
})
export default class DashboardModule {}
