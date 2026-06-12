import { Injectable } from '@nestjs/common';

@Injectable()
export default class AppService {
    // eslint-disable-next-line class-methods-use-this
    getData = (): string => '<a href="/api/openapi">Go to API!</a>';
}
