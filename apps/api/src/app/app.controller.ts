import { Controller, Get } from '@nestjs/common';

import AppService from './app.service';

@Controller()
export default class AppController {
    /**
     * @param {AppService} appService - A service class that contains the business logic for the controller.
     */
    constructor(private readonly appService: AppService) {}

    /**
     * Handles a GET request and returns the data returned by the appService.getData() method.
     * @returns {string} - The HTML data Containing redirect URL to OpenAPI page.
     */
    @Get()
    getData() {
        return this.appService.getData();
    }
}
