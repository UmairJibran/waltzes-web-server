import { ReqResMiddleware } from './req-res.middleware';

describe('ReqResMiddleware', () => {
  it('should be defined', () => {
    expect(new ReqResMiddleware()).toBeDefined();
  });
});
