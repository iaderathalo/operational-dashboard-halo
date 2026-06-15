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
    Req,
} from '@nestjs/common';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import ApplicationsService from './applications.service';

@Controller('applications')
export default class ApplicationsController {
    /**
     * Creates the applications controller.
     * @param {object} applicationsService - service used to query and mutate application records
     */
    constructor(private readonly applicationsService: ApplicationsService) {}

    /**
     * Returns applications filtered by the optional query parameters and current user scope.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope owned applications
     * @param {string} [status] - optional application status filter
     * @param {string} [tier] - optional application tier filter before numeric conversion
     * @param {string} [businessUnit] - optional business-unit filter
     * @param {string} [search] - optional text search across application fields
     * @returns {Promise<object[]>} matching applications
     */
    @Get()
    async findAll(
        @Req() request: { user?: { email?: string } },
        @Query('status') status?: string,
        @Query('tier') tier?: string,
        @Query('businessUnit') businessUnit?: string,
        @Query('search') search?: string
    ): Promise<Application[]> {
        return this.applicationsService.findAll(
            {
                status,
                tier: tier ? Number(tier) : undefined,
                businessUnit,
                search,
            },
            request.user?.email
        );
    }

    /**
     * Returns a single application, optionally scoped to the authenticated user.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope owned applications
     * @param {string} id - application identifier
     * @returns {Promise<object>} matching application
     */
    @Get(':id')
    async findOne(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string
    ): Promise<Application> {
        return this.applicationsService.findOne(id, request.user?.email);
    }

    /**
     * Creates a new application record.
     * @param {object} application - application payload to create
     * @returns {Promise<object>} created identifier response
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() application: Application) {
        const insertedId = await this.applicationsService.create(application);
        return { id: insertedId };
    }

    /**
     * Updates an existing application record.
     * @param {string} id - application identifier
     * @param {object} application - replacement application payload
     * @returns {Promise<object>} update confirmation response
     */
    @Put(':id')
    async update(@Param('id') id: string, @Body() application: Application) {
        await this.applicationsService.update(id, application);
        return { message: 'Application updated' };
    }

    /**
     * Applies a manual status override to an application.
     * @param {string} id - application identifier
     * @param {object} override - status override payload
     * @param {string} override.status - overridden status value
     * @param {string} override.overriddenBy - actor applying the override
     * @param {string} override.reason - rationale for the override
     * @returns {Promise<object>} updated application with status override
     */
    @Put(':id/status-override')
    async setStatusOverride(
        @Param('id') id: string,
        @Body() override: { status: string; overriddenBy: string; reason: string }
    ) {
        return this.applicationsService.updateStatusOverride(id, override);
    }

    /**
     * Clears the manual status override for an application.
     * @param {string} id - application identifier
     * @returns {Promise<object>} updated application without a status override
     */
    @Delete(':id/status-override')
    async clearStatusOverride(@Param('id') id: string) {
        return this.applicationsService.clearStatusOverride(id);
    }

    /**
     * Deletes an application record.
     * @param {string} id - application identifier
     * @returns {Promise<object>} deletion confirmation response
     */
    @Delete(':id')
    async delete(@Param('id') id: string) {
        await this.applicationsService.delete(id);
        return { message: 'Application deleted' };
    }
}
