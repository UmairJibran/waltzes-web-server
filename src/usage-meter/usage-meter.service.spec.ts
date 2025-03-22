import { Test, TestingModule } from '@nestjs/testing';
import { UsageMeterService } from './usage-meter.service';

describe('UsageMeterService', () => {
  let service: UsageMeterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsageMeterService],
    }).compile();

    service = module.get<UsageMeterService>(UsageMeterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
