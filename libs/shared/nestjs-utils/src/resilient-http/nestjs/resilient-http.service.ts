import { Logger } from '@mmctech-artifactory/polaris-logger';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AxiosInstance } from 'axios';

import { AXIOS_INSTANCE_TOKEN, RESILIENT_HTTP_CONFIG } from './resilient-http.constants';
import ResilientHttpConfig from '../axios/ResilientHttpConfig';
import applyAxiosRetryConfig from '../axios/resilient-http';

@Injectable()
export default class ResilientHttpService extends HttpService {
    /**
     * @param {AxiosInstance} axiosInstance - The axios instance that is going to be used for making the http requests.
     * @param {ResilientHttpConfig} [resilientHttpConfig] - The configuration object that defines the retry logic for failed http requests.
     * @param {Logger} [logger] - The logger service that is used to log the retry attempts.
     */
    constructor(
        @Inject(AXIOS_INSTANCE_TOKEN) axiosInstance,
        @Optional() @Inject(RESILIENT_HTTP_CONFIG) resilientHttpConfig?: ResilientHttpConfig,
        @Optional() logger?: Logger
    ) {
        super(axiosInstance);

        applyAxiosRetryConfig(this.axiosRef as AxiosInstance, resilientHttpConfig, logger);
    }
}
