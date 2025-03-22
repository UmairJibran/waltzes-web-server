import { Test, TestingModule } from '@nestjs/testing';
import { UsageMeterController } from './usage-meter.controller';

describe('UsageMeterController', () => {
  let controller: UsageMeterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsageMeterController],
    }).compile();

    controller = module.get<UsageMeterController>(UsageMeterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
