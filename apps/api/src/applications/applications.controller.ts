import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
} from '@nestjs/common';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import ApplicationsService from './applications.service';

@Controller('applications')
export default class ApplicationsController {
    constructor(private readonly applicationsService: ApplicationsService) {}

    @Get()
    async findAll(
        @Query('status') status?: string,
        @Query('tier') tier?: string,
        @Query('businessUnit') businessUnit?: string,
        @Query('search') search?: string
    ): Promise<Application[]> {
        return this.applicationsService.findAll({
            status,
            tier: tier ? Number(tier) : undefined,
            businessUnit,
            search,
        });
    }

    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Application> {
        return this.applicationsService.findOne(id);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() application: Application) {
        const insertedId = await this.applicationsService.create(application);
        return { id: insertedId };
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() application: Application) {
        await this.applicationsService.update(id, application);
        return { message: 'Application updated' };
    }

    @Put(':id/status-override')
    async setStatusOverride(
        @Param('id') id: string,
        @Body() override: { status: string; overriddenBy: string; reason: string }
    ) {
        return this.applicationsService.updateStatusOverride(id, override);
    }

    @Delete(':id/status-override')
    async clearStatusOverride(@Param('id') id: string) {
        return this.applicationsService.clearStatusOverride(id);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        await this.applicationsService.delete(id);
        return { message: 'Application deleted' };
    }
}
