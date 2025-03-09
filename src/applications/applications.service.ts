import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Application } from './schemas/application.schema';
import { Model } from 'mongoose';
import { SqsProducerService } from 'src/aws/sqs-producer/sqs-producer.service';
import { JobsService } from 'src/jobs/jobs.service';
import { Job } from 'src/jobs/entities/job.entity';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name) private applications: Model<Application>,
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService: JobsService,
    private readonly sqsProducerService: SqsProducerService,
  ) {}

  async create(
    createApplicationDto: CreateApplicationDto,
    user: string,
    baseUrl: string,
  ) {
    const existingJob = await this.jobsService.findByUrl(
      createApplicationDto.jobUrl,
    );
    let jobId: string = existingJob?._id.toString() || '';
    if (!existingJob) {
      const newJob = await this.jobsService.initJob(
        createApplicationDto.jobUrl,
        { baseUrl },
      );
      jobId = newJob._id.toString();
    } else if (existingJob.status === 'done') {
      // TODO: send messages to resume and/or cover letter queues with data
    } else if (existingJob?.status === 'error') {
      await this.jobsService.initJob(createApplicationDto.jobUrl, { baseUrl });
    }

    const app = await this.applications.create({
      ...createApplicationDto,
      user,
      job: jobId,
    });

    return { applicationId: app._id };
  }

  async getApplication(applicationId: string) {
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
      return null;
    }

    const requiresResume = app.generateResume;
    const requiresCoverLetter = app.generateCoverLetter;

    const steps = {
      scraping: 'pending',
      resume: 'pending',
      coverLetter: 'pending',
      pdf: 'pending',
    };

    const downloadUrls = {
      resume: '',
      coverLetter: '',
    };

    if (app.job?.status === 'done') {
      steps.scraping = 'done';
    }

    if (!requiresResume) {
      steps.resume = 'skipped';
      downloadUrls.resume = 'skipped';
    } else if (app.appliedWith?.resume) {
      steps.resume = 'done';
      downloadUrls.resume = app.appliedWith.resume;
    }

    if (!requiresCoverLetter) {
      steps.coverLetter = 'skipped';
      downloadUrls.coverLetter = 'skipped';
    } else if (app.appliedWith?.coverLetter) {
      steps.coverLetter = 'done';
      downloadUrls.coverLetter = app.appliedWith.coverLetter;
    }

    if (
      ['done', 'skipped'].includes(steps.resume) &&
      ['done', 'skipped'].includes(steps.coverLetter)
    ) {
      steps.pdf = 'done';
    }

    const overallStatus = Object.values(steps).every(
      (step) => step === 'done' || step === 'skipped',
    )
      ? 'finished'
      : 'processing';

    return {
      status: steps.scraping == 'done' ? overallStatus : 'enqueue',
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
    const query = {
      user,
      deletedAt: null,
      ...(status && { applicationStatus: status }),
    };

    const skip = (page - 1) * pageSize;

    const [applications, total] = await Promise.all([
      this.applications
        .find(query)
        .skip(skip)
        .sort({ createdAt: 'asc' })
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

    return {
      data: applications,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string, user: string) {
    const app = await this.applications.findOne({
      _id: id,
      user,
      deletedAt: null,
    });
    return app;
  }

  async update(
    id: string,
    user: string,
    updateApplicationDto: UpdateApplicationDto,
  ) {
    const app = await this.applications.findOneAndUpdate(
      { _id: id, user, deletedAt: null },
      updateApplicationDto,
    );
    return app;
  }

  async remove(id: string, user: string) {
    const app = await this.applications.findOneAndUpdate(
      { _id: id, user, deletedAt: null },
      { deletedAt: new Date() },
      { new: true },
    );
    return app;
  }

  async startProcessingByUrl(url: string, jobDetails: Job) {
    const pendingApplications = await this.applications
      .find({
        jobUrl: url,
      })
      .populate([
        {
          path: 'user',
          model: 'User',
          select:
            'linkedinScrapedData firstName lastName email phone portfolioUrl linkedinUsername githubUsername additionalInstructions',
        },
      ]);

    interface IMessage {
      applicationId: string;
      callbackUrl: string;
      jobDetails: Partial<Job>;
      applicantDetails: object;
      resume: boolean;
      coverLetter: boolean;
    }
    const messages: IMessage[] = [];
    for (const app of pendingApplications) {
      messages.push({
        applicationId: app._id.toString(),
        callbackUrl: '',
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
        await this.sqsProducerService.sendMessage(
          {
            jobDetails: message.jobDetails,
            applicantDetails: message.applicantDetails,
            callbackUrl: message.callbackUrl,
          },
          'resumeCreator',
          message.applicationId,
          message.applicationId,
        );
      }
      if (message.coverLetter) {
        await this.sqsProducerService.sendMessage(
          {
            jobDetails: message.jobDetails,
            applicantDetails: message.applicantDetails,
            callbackUrl: message.callbackUrl,
          },
          'coverLetterCreator',
          message.applicationId,
          message.applicationId,
        );
      }
    }
  }
}
