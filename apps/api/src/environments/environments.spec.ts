import env from './environment';
import envProd from './environment.prod';

describe('Environments', () => {
    it('should be defined', () => {
        expect(env.production).toBeFalsy();
        expect(envProd.production).toBeTruthy();
    });
});
