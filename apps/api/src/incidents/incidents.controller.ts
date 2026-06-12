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
    constructor(private readonly incidentsService: IncidentsService) {}

    @Get()
    async findAll(
        @Query('status') status?: string,
        @Query('severity') severity?: string,
        @Query('applicationId') applicationId?: string
    ): Promise<Incident[]> {
        return this.incidentsService.findAll({ status, severity, applicationId });
    }

    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Incident> {
        return this.incidentsService.findOne(id);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() request: CreateIncidentRequest) {
        return this.incidentsService.create(request);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() updates: Partial<Incident>) {
        return this.incidentsService.update(id, updates);
    }
}
