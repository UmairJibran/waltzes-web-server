import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from 'src/auth/constants';
import { UpdateUserDto } from 'src/users/dto/update-user.dto';
import { UpdateJobDto } from 'src/jobs/dto/update-job.dto';
import { UsersService } from 'src/users/users.service';
import { JobsService } from 'src/jobs/jobs.service';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import { ApplicationsService } from 'src/applications/applications.service';
import { CreationEventDto } from 'src/subscriptions/dto/create-subscription.dto';

@Controller('_internal')
export class InternalController {
  constructor(
    private readonly usersService: UsersService,
    private readonly applicationsService: ApplicationsService,
    private readonly jobsService: JobsService,
    private readonly subscriptionService: SubscriptionsService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('users/:userId/linkedin')
  async updateUserLinkedin(
    @Body() updateUserDto: UpdateUserDto,
    @Param('userId') userId: string,
    @Query('check-value') checkValue: string,
  ) {
    if (!userId || !checkValue) {
      return;
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      return;
    }

    if (typeof checkValue !== 'string' || checkValue.length === 0) {
      return;
    }
    console.log(
      `[${new Date().toISOString()}] Starting updateLinkedinFromWebhook for userId: ${userId}`,
    );
    const updatedUser = await this.usersService.updateLinkedinFromWebhook(
      userId,
      updateUserDto,
      checkValue,
    );
    console.log(
      `[${new Date().toISOString()}] Completed updateLinkedinFromWebhook for userId: ${userId}`,
    );
    return updatedUser;
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('job-scraper')
  async storeJobDetails(
    @Body() jobDetailsDto: UpdateJobDto,
    @Query('job-url') jobUrl: string,
    @Query('just-started') justStarted: boolean,
  ) {
    console.log(
      `[${new Date().toISOString()}] Starting updateFromWebhook for job URL: ${jobUrl} with justStarted: ${justStarted}`,
    );
    if (justStarted) {
      await this.applicationsService.scrapingStarted(jobUrl);
    } else {
      await this.jobsService.updateFromWebhook(jobUrl, jobDetailsDto);
    }
    console.log(
      `[${new Date().toISOString()}] Completed updateFromWebhook for job URL: ${jobUrl} with justStarted: ${justStarted}`,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('resume-segments')
  async storeResumeRaw(
    @Body() resumeRaw: object,
    @Query('application-id') applicationId: string,
    @Query('just-started') justStarted: boolean,
  ) {
    console.log(
      `[${new Date().toISOString()}] Starting storeResumeSegments for applicationId: ${applicationId} with justStarted: ${justStarted}`,
    );
    if (justStarted) {
      await this.applicationsService.resumeProcessingStarted(applicationId);
    } else {
      await this.applicationsService.storeResumeSegments(
        applicationId,
        resumeRaw,
      );
    }
    console.log(
      `[${new Date().toISOString()}] Completed storeResumeSegments for applicationId: ${applicationId} with justStarted: ${justStarted}`,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('cover-letter-segments')
  async storeCoverLetterRaw(
    @Body() coverLetterRaw: { content: string },
    @Query('application-id') applicationId: string,
    @Query('just-started') justStarted: boolean,
  ) {
    console.log(
      `[${new Date().toISOString()}] Starting storeCoverLetterSegments for applicationId: ${applicationId} with justStarted: ${justStarted}`,
    );
    if (justStarted) {
      await this.applicationsService.coverLetterProcessingStarted(
        applicationId,
      );
    } else {
      await this.applicationsService.storeCoverLetterSegments(
        applicationId,
        coverLetterRaw.content,
      );
    }
    console.log(
      `[${new Date().toISOString()}] Completed storeCoverLetterSegments for applicationId: ${applicationId} with justStarted: ${justStarted}`,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('pdf-processed')
  async storePdf(
    @Body()
    pdfFiles: {
      resumePdf: string;
      coverLetterPdf: string;
    },
    @Query('application-id') applicationId: string,
  ) {
    console.log(
      `[${new Date().toISOString()}] Starting storeDocumentLinks for applicationId: ${applicationId}`,
    );
    await this.applicationsService.storeDocumentLinks(applicationId, pdfFiles);
    console.log(
      `[${new Date().toISOString()}] Completed storeDocumentLinks for applicationId: ${applicationId}`,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('chargebee-subscription-alert')
  async updateUserSubscription(@Body() body: CreationEventDto) {
    console.log(
      `[${new Date().toISOString()}] Starting createSubscription for customerId: ${body.content?.customer?.id || 'unknown'}`,
    );
    if (body.event_type === 'subscription_cancelled') {
      await this.subscriptionService.cancelSubscription(body);
    } else if (body.event_type === 'subscription_created') {
      await this.subscriptionService.createSubscription(body);
    } else if (
      [
        'subscription_reactivated',
        'subscription_reactivated_with_backdating',
      ].includes(body.event_type)
    ) {
      await this.subscriptionService.resumeSubscription(body);
    }
    console.log(
      `[${new Date().toISOString()}] Completed createSubscription for customerId: ${body.content?.customer?.id || 'unknown'}`,
    );
  }
}
