import bootstrap from './server';

// Prevent the ConfigModule from trying to load from process.env.
jest.mock('./server', () => jest.fn());

describe('Server', () => {
    it('should bootstrap', () => {
        // The below is a copy from https://github.com/ComBarnea/nestjs-boilerplate/blob/master/src/server.spec.ts
        // The require seems to be the trick to getting the test to work.
        // eslint-disable-next-line global-require
        require('./main');
        expect(bootstrap).toHaveBeenCalledTimes(1);
    });
});
