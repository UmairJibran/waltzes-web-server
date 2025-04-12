import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { User } from 'src/auth/constants';
import { ReCreateApplicationDto } from './dto/recreate-application.dto';
import { randomBytes } from 'crypto';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(
    @Body() createApplicationDto: CreateApplicationDto,
    @User() user: JwtPayload,
  ) {
    let { jobUrl } = createApplicationDto;
    if (createApplicationDto.mode === 'selected_text') {
      const url = new URL(jobUrl);
      url.searchParams.append('random-seed', randomBytes(16).toString('hex'));
      url.searchParams.append('mode', 'selected_text');
      url.searchParams.append('user', user.sub);
      jobUrl = url.toString();
    }
    return this.applicationsService.create(
      {
        ...createApplicationDto,
        jobUrl,
      },
      user.sub,
    );
  }

  @Post('recreate')
  recreateOne(@Body() reCreateApplicationDto: ReCreateApplicationDto) {
    return this.applicationsService.reprocessSingleApplication(
      reCreateApplicationDto,
    );
  }

  @Get()
  findAll(
    @Query('status')
    status: 'applied' | 'interviewing' | 'rejected' | 'accepted',
    @Query('page')
    page: number,
    @Query('pageSize')
    pageSize: number,
    @User() user: JwtPayload,
  ) {
    return this.applicationsService.findAll(user.sub, {
      status,
      page,
      pageSize,
    });
  }

  @Get(':id')
  findApplication(
    @Param('id')
    id: string,
  ) {
    return this.applicationsService.getApplication(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @User() user: JwtPayload) {
    return this.applicationsService.findOne(id, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateApplicationDto: UpdateApplicationDto,
    @User() user: JwtPayload,
  ) {
    return this.applicationsService.update(id, user.sub, updateApplicationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @User() user: JwtPayload) {
    return this.applicationsService.remove(id, user.sub);
  }
}
