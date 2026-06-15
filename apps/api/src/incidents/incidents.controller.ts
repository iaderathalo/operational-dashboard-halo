import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
} from '@nestjs/common';

import {
    CreateIncidentRequest,
    Incident,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import IncidentsService from './incidents.service';

@Controller('incidents')
export default class IncidentsController {
    /**
     * Creates the incidents controller.
     * @param {object} incidentsService - service used to query and mutate incidents
     */
    constructor(private readonly incidentsService: IncidentsService) {}

    /**
     * Returns incidents filtered by optional status, severity, and application identifier.
     * @param {string} [status] - optional incident status filter
     * @param {string} [severity] - optional incident severity filter
     * @param {string} [applicationId] - optional application identifier filter
     * @returns {Promise<object[]>} matching incidents
     */
    @Get()
    async findAll(
        @Query('status') status?: string,
        @Query('severity') severity?: string,
        @Query('applicationId') applicationId?: string
    ): Promise<Incident[]> {
        return this.incidentsService.findAll({ status, severity, applicationId });
    }

    /**
     * Returns a single incident by identifier.
     * @param {string} id - incident identifier
     * @returns {Promise<object>} matching incident
     */
    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Incident> {
        return this.incidentsService.findOne(id);
    }

    /**
     * Creates a new incident.
     * @param {object} request - incident creation payload
     * @returns {Promise<object>} created incident
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() request: CreateIncidentRequest) {
        return this.incidentsService.create(request);
    }

    /**
     * Updates an existing incident.
     * @param {string} id - incident identifier
     * @param {object} updates - partial incident changes to apply
     * @returns {Promise<object>} updated incident
     */
    @Put(':id')
    async update(@Param('id') id: string, @Body() updates: Partial<Incident>) {
        return this.incidentsService.update(id, updates);
    }
}
