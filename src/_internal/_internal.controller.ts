import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Logger,
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
  private readonly logger = new Logger(InternalController.name);

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
    try {
      this.logger.debug(`Starting LinkedIn update for user: ${userId}`);
      if (!userId || !checkValue) {
        this.logger.warn('Missing required parameters for LinkedIn update');
        return;
      }
      if (typeof userId !== 'string' || userId.length === 0) {
        this.logger.warn('Invalid userId format for LinkedIn update');
        return;
      }

      if (typeof checkValue !== 'string' || checkValue.length === 0) {
        this.logger.warn('Invalid checkValue format for LinkedIn update');
        return;
      }

      const updatedUser = await this.usersService.updateLinkedinFromWebhook(
        userId,
        updateUserDto,
        checkValue,
      );
      this.logger.debug(
        `Successfully updated LinkedIn data for user: ${userId}`,
      );
      return updatedUser;
    } catch (error) {
      this.logger.error(
        `Error updating LinkedIn data for user: ${userId}`,
        error,
      );
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('job-scraper')
  async storeJobDetails(
    @Body() jobDetailsDto: UpdateJobDto,
    @Query('job-url') jobUrl: string,
    @Query('just-started') justStarted: boolean,
  ) {
    try {
      this.logger.debug(`Processing job details for URL: ${jobUrl}`);
      if (justStarted) {
        await this.applicationsService.scrapingStarted(jobUrl);
        this.logger.debug(`Started scraping for job URL: ${jobUrl}`);
      } else {
        await this.jobsService.updateFromWebhook(jobUrl, jobDetailsDto);
        this.logger.debug(`Updated job details for URL: ${jobUrl}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing job details for URL: ${jobUrl}`,
        error,
      );
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('resume-segments')
  async storeResumeRaw(
    @Body() resumeRaw: object,
    @Query('application-id') applicationId: string,
    @Query('just-started') justStarted: boolean,
  ) {
    try {
      this.logger.debug(
        `Processing resume segments for application: ${applicationId}`,
      );
      if (justStarted) {
        await this.applicationsService.resumeProcessingStarted(applicationId);
        this.logger.debug(
          `Started resume processing for application: ${applicationId}`,
        );
      } else {
        await this.applicationsService.storeResumeSegments(
          applicationId,
          resumeRaw,
        );
        this.logger.debug(
          `Stored resume segments for application: ${applicationId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing resume segments for application: ${applicationId}`,
        error,
      );
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('cover-letter-segments')
  async storeCoverLetterRaw(
    @Body() coverLetterRaw: { content: string },
    @Query('application-id') applicationId: string,
    @Query('just-started') justStarted: boolean,
  ) {
    try {
      this.logger.debug(
        `Processing cover letter segments for application: ${applicationId}`,
      );
      if (justStarted) {
        await this.applicationsService.coverLetterProcessingStarted(
          applicationId,
        );
        this.logger.debug(
          `Started cover letter processing for application: ${applicationId}`,
        );
      } else {
        await this.applicationsService.storeCoverLetterSegments(
          applicationId,
          coverLetterRaw.content,
        );
        this.logger.debug(
          `Stored cover letter segments for application: ${applicationId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing cover letter segments for application: ${applicationId}`,
        error,
      );
      throw error;
    }
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
    try {
      this.logger.debug(
        `Processing PDF files for application: ${applicationId}`,
      );
      await this.applicationsService.storeDocumentLinks(
        applicationId,
        pdfFiles,
      );
      this.logger.debug(
        `Successfully stored PDF files for application: ${applicationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing PDF files for application: ${applicationId}`,
        error,
      );
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('chargebee-subscription-alert')
  async updateUserSubscription(@Body() body: CreationEventDto) {
    try {
      this.logger.debug(
        `Processing subscription alert for customer: ${body.content?.customer?.id}`,
      );
      const cancelStatuses = ['subscription_cancelled', 'subscription_deleted'];
      const resumeStatuses = [
        'subscription_reactivated',
        'subscription_reactivated_with_backdating',
      ];
      if (cancelStatuses.includes(body.event_type)) {
        await this.subscriptionService.cancelSubscription(body);
        this.logger.debug(
          `Cancelled subscription for customer: ${body.content?.customer?.id}`,
        );
      } else if (body.event_type === 'subscription_created') {
        await this.subscriptionService.createSubscription(body);
        this.logger.debug(
          `Created subscription for customer: ${body.content?.customer?.id}`,
        );
      } else if (resumeStatuses.includes(body.event_type)) {
        await this.subscriptionService.resumeSubscription(body);
        this.logger.debug(
          `Resumed subscription for customer: ${body.content?.customer?.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing subscription alert for customer: ${body.content?.customer?.id}`,
        error,
      );
      throw error;
    }
  }
}
