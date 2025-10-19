import {
  forwardRef,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Application } from './schemas/application.schema';
import { Model } from 'mongoose';
import { SqsProducerService } from 'src/aws/sqs-producer/sqs-producer.service';
import { JobsService } from 'src/jobs/jobs.service';
import { Job } from 'src/jobs/entities/job.entity';
import { JobDocument } from 'src/jobs/schemas/job.schema';
import { UserDocument } from 'src/users/schemas/user.schema';
import { S3Service } from 'src/aws/s3/s3.service';
import { UsersService } from 'src/users/users.service';
import { ConfigService } from '@nestjs/config';
import { UsageMeterService } from 'src/usage-meter/usage-meter.service';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  private readonly userDataForApplication =
    'linkedinScrapedData firstName lastName email phone portfolioUrl linkedinUsername githubUsername additionalInstructions';

  constructor(
    @InjectModel(Application.name) private applications: Model<Application>,
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService: JobsService,
    private readonly sqsProducerService: SqsProducerService,
    private readonly usersService: UsersService,
    private readonly usageMeterService: UsageMeterService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {}

  async create(createApplicationDto: CreateApplicationDto, user: string) {
    this.logger.log(
      `Creating application for user: ${user} with job URL: ${createApplicationDto.jobUrl}`,
    );

    const isUserPro = await this.usersService.isUserPro({ id: user });
    this.logger.log(`User ${user} pro status: ${isUserPro}`);

    if (!isUserPro) {
      this.logger.warn(`Non-pro user ${user} attempted to create application`);
      this.logger.log(
        'Checking if the user has used their 5 free applications',
      );

      const hasUsedFreeApplications =
        await this.usageMeterService.has5MetersForCurrentMonth(user);

      if (hasUsedFreeApplications) {
        this.logger.warn(
          `User ${user} has used their 5 free applications, throwing exception`,
        );
        throw new HttpException(
          'You have used your 5 free applications for this month. Please subscribe to continue using the service.',
          402,
        );
      } else {
        this.logger.log(
          `User ${user} has not used their 5 free applications, allowing creation`,
        );
      }
    }

    this.logger.log(
      `Checking for existing job with URL: ${createApplicationDto.jobUrl}`,
    );
    const existingJob = await this.jobsService.findByUrl(
      createApplicationDto.jobUrl,
    );

    let jobId: string = existingJob?._id.toString() || '';
    this.logger.log(`Existing job found: ${!!existingJob}, jobId: ${jobId}`);

    if (!existingJob) {
      this.logger.log(
        `No existing job found, initializing job with URL: ${createApplicationDto.jobUrl}`,
      );
      const newJob = await this.jobsService.initJob(
        createApplicationDto.jobUrl,
        createApplicationDto.selectedText,
      );
      jobId = newJob._id.toString();
      this.logger.log(`New job created with id: ${jobId}`);
    } else if (existingJob?.status === 'error') {
      this.logger.log(
        `Job with error status found, reinitializing job with URL: ${createApplicationDto.jobUrl}`,
      );
      await this.jobsService.initJob(
        createApplicationDto.jobUrl,
        createApplicationDto.selectedText,
      );
    }

    this.logger.log(
      `Creating application record with jobId: ${jobId} and user: ${user}`,
    );
    const app = await this.applications.create({
      ...createApplicationDto,
      user,
      job: jobId,
    });
    this.logger.log(`Application created with id: ${app._id.toString()}`);

    if (existingJob && existingJob.status === 'done') {
      this.logger.log(
        `Job already processed, starting application processing for job URL: ${createApplicationDto.jobUrl}`,
      );
      await this.startProcessingByUrl(createApplicationDto.jobUrl, existingJob);
    }

    return { applicationId: app._id };
  }

  async getApplication(applicationId: string) {
    this.logger.log(`Fetching application with id: ${applicationId}`);

    const app = await this.applications
      .findById({
        _id: applicationId,
      })
      .populate<{ job: { status: string } }>([
        {
          path: 'job',
          model: 'Job',
          select: 'status',
        },
      ]);

    if (!app) {
      this.logger.warn(`Application not found with id: ${applicationId}`);
      return null;
    }

    this.logger.log(`Application found, job status: ${app.job?.status}`);

    const requiresResume = app.generateResume;
    const requiresCoverLetter = app.generateCoverLetter;
    this.logger.log(
      `Application requires resume: ${requiresResume}, requires cover letter: ${requiresCoverLetter}`,
    );

    const steps = {
      scraping: 'pending',
      resume: 'pending',
      coverLetter: 'pending',
      pdf: 'pending',
    };

    const downloadUrls: {
      resume?: string;
      coverLetter?: string;
    } = {
      resume: undefined,
      coverLetter: undefined,
    };

    if (app.job?.status === 'done') {
      steps.scraping = 'done';
    } else if (app.jobScrapingStarted) {
      steps.scraping = 'processing';
    }

    if (!requiresResume) {
      steps.resume = 'skipped';
    } else if (app.resumeRaw) {
      steps.resume = 'done';
    } else if (app.resumeStarted) {
      steps.resume = 'processing';
    }

    if (!requiresCoverLetter) {
      steps.coverLetter = 'skipped';
    } else if (app.coverLetterRaw) {
      steps.coverLetter = 'done';
    } else if (app.coverLetterStarted) {
      steps.coverLetter = 'processing';
    }

    const coverLetterStatus =
      (steps.coverLetter === 'done' && app.appliedWith?.coverLetter) ||
      steps.coverLetter === 'skipped';

    const resumeStatus =
      (steps.resume === 'done' && app.appliedWith?.resume) ||
      steps.resume === 'skipped';

    if (resumeStatus && coverLetterStatus) {
      steps.pdf = 'done';
      downloadUrls.resume = app.appliedWith?.resume;
      downloadUrls.coverLetter = app.appliedWith?.coverLetter;
    }

    const overallStatus = Object.values(steps).every(
      (step) => step === 'done' || step === 'skipped',
    )
      ? 'finished'
      : Object.values(steps).some((step) => step === 'processing')
        ? 'processing'
        : 'enqueue';

    if (downloadUrls.resume) {
      downloadUrls.resume = await this.s3Service.getPreSignedUrl(
        downloadUrls.resume,
        {},
      );
    }
    if (downloadUrls.coverLetter) {
      downloadUrls.coverLetter = await this.s3Service.getPreSignedUrl(
        downloadUrls.coverLetter,
        {},
      );
    }

    this.logger.log(
      `Application status response prepared for id: ${applicationId}, overall status: ${overallStatus}`,
    );
    return {
      status: overallStatus,
      steps,
      downloadUrls,
    };
  }

  async findAll(
    user: string,
    {
      status,
      page = 1,
      pageSize = 10,
    }: {
      status?: 'applied' | 'interviewing' | 'rejected' | 'accepted';
      page?: number;
      pageSize?: number;
    },
  ) {
    this.logger.log(
      `Finding applications for user: ${user}, status: ${status || 'all'}, page: ${page}, pageSize: ${pageSize}`,
    );

    const query = {
      user,
      deletedAt: null,
      ...(status && { applicationStatus: status }),
    };
    this.logger.log(`Query for applications: ${JSON.stringify(query)}`);

    const skip = (page - 1) * pageSize;

    this.logger.log(`Executing find with skip: ${skip} and limit: ${pageSize}`);
    const [applications, total] = await Promise.all([
      this.applications
        .find(query)
        .skip(skip)
        .sort({ createdAt: 'desc' })
        .populate([
          {
            path: 'job',
            model: 'Job',
            select: 'title companyName location url',
          },
        ])
        .limit(pageSize)
        .exec(),
      this.applications.countDocuments(query),
    ]);
    this.logger.log(
      `Found ${applications.length} applications, total count: ${total}`,
    );

    this.logger.log(`Generating pre-signed URLs for applications`);
    const applicationsWithPreSignedUrls = await Promise.all(
      applications.map(async (application) => {
        const resumeUrl = application.appliedWith?.resume;
        const coverLetterUrl = application.appliedWith?.coverLetter;
        if (resumeUrl) {
          application.appliedWith.resume = await this.s3Service.getPreSignedUrl(
            resumeUrl,
            {},
          );
        }
        if (coverLetterUrl) {
          application.appliedWith.coverLetter =
            await this.s3Service.getPreSignedUrl(coverLetterUrl, {});
        }
        return application;
      }),
    );

    const totalPages = Math.ceil(total / pageSize);
    this.logger.log(
      `Returning applications data with ${applicationsWithPreSignedUrls.length} items, totalPages: ${totalPages}`,
    );

    return {
      data: applicationsWithPreSignedUrls,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findOne(id: string, user: string) {
    this.logger.log(`Finding application with id: ${id} for user: ${user}`);
    const app = await this.applications.findOne({
      _id: id,
      user,
      deletedAt: null,
    });
    this.logger.log(`Application found: ${!!app}`);
    return app;
  }

  async update(
    id: string,
    user: string,
    updateApplicationDto: UpdateApplicationDto,
  ) {
    this.logger.log(`Updating application with id: ${id} for user: ${user}`);
    this.logger.log(`Update data: ${JSON.stringify(updateApplicationDto)}`);

    const app = await this.applications.findOneAndUpdate(
      { _id: id, user, deletedAt: null },
      updateApplicationDto,
    );
    this.logger.log(`Application update result: ${!!app}`);
    return app;
  }

  async remove(id: string, user: string) {
    this.logger.log(
      `Soft deleting application with id: ${id} for user: ${user}`,
    );

    const app = await this.applications.findOneAndUpdate(
      { _id: id, user, deletedAt: null },
      { deletedAt: new Date() },
      { new: true },
    );
    this.logger.log(`Application deletion result: ${!!app}`);
    return app;
  }

  async startProcessingByUrl(url: string, jobDetails: Job) {
    this.logger.log(
      `Starting processing for applications with job URL: ${url}`,
    );

    this.logger.log(`Finding pending applications for job URL: ${url}`);
    const pendingApplications = await this.applications
      .find({
        jobUrl: url,
      })
      .populate([
        {
          path: 'user',
          model: 'User',
          select: this.userDataForApplication,
        },
      ]);
    this.logger.log(`Found ${pendingApplications.length} pending applications`);

    const messages: IMessage[] = [];
    for (const app of pendingApplications) {
      this.logger.log(
        `Preparing message for application: ${app._id.toString()}`,
      );
      messages.push({
        applicationId: app._id.toString(),
        jobDetails: {
          companyName: jobDetails.companyName,
          description: jobDetails.description,
          location: jobDetails.location,
          skills: jobDetails.skills,
          title: jobDetails.title,
        },
        applicantDetails: app.user,
        resume: app.generateResume,
        coverLetter: app.generateCoverLetter,
      });
    }

    for (const message of messages) {
      if (message.resume) {
        this.logger.log(
          `Sending resume creation message for application: ${message.applicationId}`,
        );
        const baseUrl: string = await this.configService.getOrThrow('baseUrl');
        this.logger.log(`Base URL for callback: ${baseUrl}`);
        const callbackUrl = [
          baseUrl,
          '/api/_internal/resume-segments?application-id=',
          message.applicationId.toString(),
        ].join('');
        this.logger.log(`Resume callback URL: ${callbackUrl}`);

        // Hardcoded segment order for now - will be user-configurable in the future
        const segmentOrder = [
          'experience',
          'skills',
          'certifications',
          'open_source',
          'projects',
          'education',
        ];

        await this.sqsProducerService.sendMessage(
          {
            jobDetails: message.jobDetails,
            applicantDetails: message.applicantDetails,
            callbackUrl,
            segmentOrder,
          },
          'resumeCreator',
          message.applicationId,
          message.applicationId,
        );
        this.logger.log(
          `Resume creation message sent for application: ${message.applicationId}`,
        );
      }

      if (message.coverLetter) {
        this.logger.log(
          `Sending cover letter creation message for application: ${message.applicationId}`,
        );
        const baseUrl: string = await this.configService.getOrThrow('baseUrl');
        const callbackUrl = [
          baseUrl,
          '/api/_internal/cover-letter-segments?application-id=',
          message.applicationId.toString(),
        ].join('');
        this.logger.log(`Cover letter callback URL: ${callbackUrl}`);

        await this.sqsProducerService.sendMessage(
          {
            jobDetails: message.jobDetails,
            applicantDetails: message.applicantDetails,
            callbackUrl,
          },
          'coverLetterCreator',
          message.applicationId,
          message.applicationId,
        );
        this.logger.log(
          `Cover letter creation message sent for application: ${message.applicationId}`,
        );
      }
    }

    this.logger.log(`Processing started for ${messages.length} applications`);
  }

  async reprocessSingleApplication({
    applicationId,
    documentType,
  }: {
    applicationId: string;
    documentType: 'resume' | 'coverLetter';
  }) {
    this.logger.log(
      `Reprocessing ${documentType} for application: ${applicationId}`,
    );

    this.logger.log(`Finding application with id: ${applicationId}`);
    const application = await this.applications
      .findOne({
        _id: applicationId,
      })
      .populate([
        {
          path: 'user',
          model: 'User',
          select: this.userDataForApplication,
        },
      ]);

    if (!application) {
      this.logger.warn(`Application not found with id: ${applicationId}`);
      throw new HttpException('Application not found', 404);
    }
    this.logger.log(`Application found: ${applicationId}`);

    // Mark as recreation to prevent credit charge
    this.logger.log(`Marking application as recreation: ${applicationId}`);
    await this.applications.updateOne(
      { _id: applicationId },
      { isRecreation: true },
    );

    if (documentType === 'resume' && !application.generateResume) {
      this.logger.log(
        `Enabling resume generation for application: ${applicationId}`,
      );
      application.generateResume = true;
      await application.save();
    }

    if (documentType === 'coverLetter' && !application.generateCoverLetter) {
      this.logger.log(
        `Enabling cover letter generation for application: ${applicationId}`,
      );
      application.generateCoverLetter = true;
      await application.save();
    }

    const jobDetails = await this.jobsService.findById(
      application.job as unknown as string,
    );

    if (!jobDetails) {
      this.logger.warn(`Job not found for application: ${applicationId}`);
      throw new HttpException('Job not found', 404);
    }
    this.logger.log(`Job found for application: ${applicationId}`);

    await this.sendDocumentProcessingMessage(
      documentType,
      applicationId,
      jobDetails,
      application.user,
    );
    this.logger.log(
      `Reprocessing initiated for ${documentType} of application: ${applicationId}`,
    );
  }

  async updateDocument({
    applicationId,
    documentType,
    documentData,
  }: {
    applicationId: string;
    documentType: 'resume' | 'coverLetter';
    documentData: Record<string, any> | string;
  }) {
    this.logger.log(
      `Updating ${documentType} for application: ${applicationId}`,
    );

    this.logger.log(`Finding application with id: ${applicationId}`);
    const application = await this.applications.findOne({
      _id: applicationId,
    });

    if (!application) {
      this.logger.warn(`Application not found with id: ${applicationId}`);
      throw new HttpException('Application not found', 404);
    }

    // Update the raw document data
    const updateField =
      documentType === 'resume' ? 'resumeRaw' : 'coverLetterRaw';
    this.logger.log(
      `Updating ${updateField} for application: ${applicationId}`,
    );

    await this.applications.updateOne(
      { _id: applicationId },
      { [updateField]: documentData },
    );

    // Trigger PDF recreation without charging credits
    this.logger.log(
      `Triggering PDF recreation for application: ${applicationId}`,
    );
    await this.createPdf(applicationId);

    this.logger.log(
      `Document updated successfully for application: ${applicationId}`,
    );

    return { success: true };
  }

  private async sendDocumentProcessingMessage(
    documentType: 'resume' | 'coverLetter',
    applicationId: string,
    jobDetails: Job,
    applicantDetails: unknown,
  ): Promise<void> {
    this.logger.log(
      `Sending ${documentType} processing message for application: ${applicationId}`,
    );

    const baseUrl: string = await this.configService.getOrThrow('baseUrl');
    this.logger.log(`Base URL for callback: ${baseUrl}`);

    const queueName =
      documentType === 'resume' ? 'resumeCreator' : 'coverLetterCreator';
    const endpoint =
      documentType === 'resume' ? 'resume-segments' : 'cover-letter-segments';
    this.logger.log(`Using queue: ${queueName} and endpoint: ${endpoint}`);

    const callbackUrl = [
      baseUrl,
      `/api/_internal/${endpoint}?application-id=`,
      applicationId,
    ].join('');
    this.logger.log(`Callback URL: ${callbackUrl}`);

    const messageBody: any = {
      jobDetails: {
        companyName: jobDetails.companyName,
        description: jobDetails.description,
        location: jobDetails.location,
        skills: jobDetails.skills,
        title: jobDetails.title,
      },
      applicantDetails,
      callbackUrl,
    };

    // Add segment order for resume generation
    if (documentType === 'resume') {
      // Hardcoded segment order for now - will be user-configurable in the future
      messageBody.segmentOrder = [
        'experience',
        'skills',
        'certifications',
        'open_source',
        'projects',
        'education',
      ];
    }

    await this.sqsProducerService.sendMessage(
      messageBody,
      queueName,
      applicationId,
      applicationId,
    );
    this.logger.log(
      `Message sent to ${queueName} for application: ${applicationId}`,
    );
  }

  async storeDocumentLinks(
    applicationId: string,
    pdfFiles: {
      resumePdf: string | null;
      coverLetterPdf: string | null;
    },
  ) {
    this.logger.log(`Storing document links for application: ${applicationId}`);
    this.logger.log(`PDF files: ${JSON.stringify(pdfFiles)}`);

    const { resumePdf, coverLetterPdf } = pdfFiles;
    const result = await this.applications.updateOne(
      { _id: applicationId },
      {
        appliedWith: {
          resume: resumePdf,
          coverLetter: coverLetterPdf,
        },
      },
    );
    this.logger.log(`Document links update result: ${JSON.stringify(result)}`);
  }

  async storeResumeSegments(applicationId: string, segments: object) {
    this.logger.log(
      `Storing resume segments for application: ${applicationId}`,
    );
    this.logger.log(
      `Resume segments received: ${JSON.stringify(segments).substring(0, 200)}...`,
    );

    const application = await this.applications.findOneAndUpdate(
      { _id: applicationId },
      { resumeRaw: segments },
    );

    if (!application) {
      this.logger.warn(
        `Application not found when storing resume segments: ${applicationId}`,
      );
      return;
    }

    const userId = application.user;
    
    // Only record metered usage if this is not a recreation
    if (!application.isRecreation) {
      this.logger.log(
        `Recording metered usage for user: ${userId as unknown as string}`,
      );
      await this.usersService.recordMeteredUsage(userId);
    } else {
      this.logger.log(
        `Skipping metered usage for recreation: ${applicationId}`,
      );
      // Reset the isRecreation flag after processing
      await this.applications.updateOne(
        { _id: applicationId },
        { isRecreation: false },
      );
    }

    this.logger.log(
      `Initiating PDF creation for application: ${applicationId}`,
    );
    await this.createPdf(applicationId);
    this.logger.log(`Resume segments stored for application: ${applicationId}`);
  }

  async storeCoverLetterSegments(applicationId: string, segments: string) {
    this.logger.log(
      `Storing cover letter segments for application: ${applicationId}`,
    );
    this.logger.log(
      `Cover letter segments received: ${segments.substring(0, 200)}...`,
    );

    const application = await this.applications.findOneAndUpdate(
      { _id: applicationId },
      { coverLetterRaw: segments },
    );

    if (!application) {
      this.logger.warn(
        `Application not found when storing cover letter segments: ${applicationId}`,
      );
      return;
    }

    const userId = application.user;
    
    // Only record metered usage if this is not a recreation
    if (!application.isRecreation) {
      this.logger.log(
        `Recording metered usage for user: ${userId as unknown as string}`,
      );
      await this.usersService.recordMeteredUsage(userId);
    } else {
      this.logger.log(
        `Skipping metered usage for recreation: ${applicationId}`,
      );
      // Reset the isRecreation flag after processing
      await this.applications.updateOne(
        { _id: applicationId },
        { isRecreation: false },
      );
    }

    this.logger.log(
      `Initiating PDF creation for application: ${applicationId}`,
    );
    await this.createPdf(applicationId);
    this.logger.log(
      `Cover letter segments stored for application: ${applicationId}`,
    );
  }

  async createPdf(applicationId: string) {
    this.logger.log(`Creating PDF for application: ${applicationId}`);

    this.logger.log(`Finding application with id: ${applicationId}`);
    const app = await this.applications
      .findById(applicationId)
      .populate<{ job: JobDocument; user: UserDocument }>([
        {
          path: 'job',
          model: 'Job',
          select: 'title companyName',
        },
        {
          path: 'user',
          model: 'User',
          select: 'firstName lastName email',
        },
      ]);

    if (!app) {
      this.logger.warn(
        `Application not found when creating PDF: ${applicationId}`,
      );
      return;
    }

    if (app.generateResume && !app.resumeRaw) {
      this.logger.log(
        `Skipping PDF creation - resume required but not ready for application: ${applicationId}`,
      );
      return;
    }

    if (app.generateCoverLetter && !app.coverLetterRaw) {
      this.logger.log(
        `Skipping PDF creation - cover letter required but not ready for application: ${applicationId}`,
      );
      return;
    }

    this.logger.log(
      `All documents ready, proceeding with PDF creation for application: ${applicationId}`,
    );
    const baseUrl: string = await this.configService.getOrThrow('baseUrl');
    const callbackUrl = [
      baseUrl,
      '/api/_internal/pdf-processed?application-id=',
      applicationId.toString(),
    ].join('');
    this.logger.log(`PDF callback URL: ${callbackUrl}`);

    const messageBody = {
      callbackUrl,
      jobDetails: {
        title: app.job.title,
        companyName: app.job.companyName,
      },
      applicantDetails: {
        firstName: app.user.firstName,
        lastName: app.user.lastName,
        email: app.user.email,
      },
      path: `generated/users/${app.user._id.toString()}/applications/${applicationId}`,
      resume: app.generateResume ? app.resumeRaw : null,
      coverLetter: app.generateCoverLetter ? app.coverLetterRaw : null,
    };
    this.logger.log(
      `PDF message prepared: ${JSON.stringify({
        ...messageBody,
        resume: app.generateResume ? '[CONTENT]' : null,
        coverLetter: app.generateCoverLetter ? '[CONTENT]' : null,
      })}`,
    );

    await this.sqsProducerService.sendMessage(
      messageBody,
      'pdfProcessor',
      applicationId,
      applicationId,
    );
    this.logger.log(
      `PDF creation message sent for application: ${applicationId}`,
    );
  }

  async scrapingStarted(jobUrl: string) {
    this.logger.log(
      `Marking scraping started for applications with job URL: ${jobUrl}`,
    );
    const result = await this.applications.updateMany(
      { jobUrl },
      { $set: { jobScrapingStarted: true } },
    );
    this.logger.log(
      `Scraping started update result: ${JSON.stringify(result)}`,
    );
  }

  async resumeProcessingStarted(applicationId: string) {
    this.logger.log(
      `Marking resume processing started for application: ${applicationId}`,
    );
    const result = await this.applications.updateOne(
      { _id: applicationId },
      { $set: { resumeStarted: true } },
    );
    this.logger.log(
      `Resume processing started update result: ${JSON.stringify(result)}`,
    );
  }

  async coverLetterProcessingStarted(applicationId: string) {
    this.logger.log(
      `Marking cover letter processing started for application: ${applicationId}`,
    );
    const result = await this.applications.updateOne(
      { _id: applicationId },
      { $set: { coverLetterStarted: true } },
    );
    this.logger.log(
      `Cover letter processing started update result: ${JSON.stringify(result)}`,
    );
  }
}
