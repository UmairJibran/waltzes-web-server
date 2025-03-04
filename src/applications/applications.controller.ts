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

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(
    @Body() createApplicationDto: CreateApplicationDto,
    @User() user: JwtPayload,
  ) {
    return this.applicationsService.create(createApplicationDto, user.sub);
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
    return this.applicationsService.findAll(user.sub, { status });
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
