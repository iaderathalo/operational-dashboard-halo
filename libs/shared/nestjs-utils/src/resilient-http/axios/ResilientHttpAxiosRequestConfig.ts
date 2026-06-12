import { AxiosRequestConfig } from 'axios';

import ResilientHttpState from './ResilientHttpState';

/**
 * An extension of the config object sent with every Axios request, containing
 * an optional set of resilient HTTP state.
 */
export default interface ResilientHttpAxiosRequestConfig extends AxiosRequestConfig {
    /**
     * The resilient HTTP state to be included in the request config.
     */
    resilientHttpState?: ResilientHttpState;
}
