import { AxiosRequestConfig } from 'axios';

import ResilientHttpConfig from '../axios/ResilientHttpConfig';

export default interface ResilientHttpModuleOptions {
    resilientHttpConfig: ResilientHttpConfig;
    axiosConfig: AxiosRequestConfig;
}
