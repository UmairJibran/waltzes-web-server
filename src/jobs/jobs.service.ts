import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { UpdateJobDto } from './dto/update-job.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from './schemas/job.schema';
import { Model } from 'mongoose';
import { SqsProducerService } from 'src/aws/sqs-producer/sqs-producer.service';
import { ApplicationsService } from 'src/applications/applications.service';
import { ConfigService } from '@nestjs/config';
import { CreateJobDto } from './dto/create-job.dto';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectModel(Job.name) private jobs: Model<Job>,
    @Inject(forwardRef(() => ApplicationsService))
    private readonly applicationsService: ApplicationsService,
    private readonly sqsProducerService: SqsProducerService,
    private readonly configService: ConfigService,
  ) {}

  async initJob(url: string) {
    this.logger.log(`Initializing job for URL: ${url}`);
    const baseUrl: string = await this.configService.getOrThrow('baseUrl');
    this.logger.debug(`Base URL from config: ${baseUrl}`);
    const callbackUrl = new URL(
      [baseUrl, '/api/_internal/job-scraper'].join(''),
    );
    callbackUrl.searchParams.append('job-url', url);
    this.logger.debug(`Callback URL constructed: ${callbackUrl.toString()}`);
    this.logger.debug(
      `Sending SQS message to job scraper queue for URL: ${url}`,
    );
    await this.sqsProducerService.sendMessage(
      {
        jobUrl: url,
        callbackUrl: callbackUrl.toString(),
      },
      'jobScraper',
      url,
      url,
    );
    this.logger.debug(`SQS message sent successfully for URL: ${url}`);
    this.logger.debug(
      `Creating new job document with status 'pending' for URL: ${url}`,
    );
    const createdJob = await this.jobs.create({ url, status: 'pending' });
    this.logger.log(
      `Job initialized with ID: ${createdJob._id.toString()} for URL: ${url}`,
    );
    return createdJob;
  }

  async findByUrl(url: string) {
    this.logger.debug(`Finding job by URL: ${url}`);
    const job = await this.jobs.findOne({ url });
    if (job) {
      this.logger.debug(
        `Found job with ID: ${job._id.toString()} for URL: ${url}`,
      );
    } else {
      this.logger.debug(`No job found for URL: ${url}`);
    }
    return job;
  }

  async findById(id: string) {
    try {
      this.logger.debug(`Finding job by ID: ${id}`);
      const job = await this.jobs.findById(id);
      if (!job) {
        this.logger.debug(`Job not found with ID: ${id}`);
      } else {
        this.logger.debug(
          `Found job with ID: ${id}, title: ${job.title}, status: ${job.status}`,
        );
      }
      return job;
    } catch (error) {
      this.logger.error(`Error finding job by ID: ${id}`, error);
      throw error;
    }
  }

  async updateFromWebhook(url: string, updateJobDto: UpdateJobDto) {
    try {
      this.logger.log(`Updating job from webhook with URL: ${url}`);
      this.logger.debug(`Update data: ${JSON.stringify(updateJobDto)}`);
      const job = await this.findByUrl(url);
      if (!job) {
        this.logger.warn(`Job not found for webhook update with URL: ${url}`);
        return;
      }
      this.logger.debug(`Found job with ID: ${job._id.toString()} for update`);
      job.description = updateJobDto.description;
      job.title = updateJobDto.title ?? 'N/A';
      job.companyName = updateJobDto.companyName ?? 'N/A';
      job.location = updateJobDto.location ?? 'N/A';
      job.salary = updateJobDto.salary ?? 'N/A';
      job.skills = updateJobDto.skills;
      job.status = 'done';
      this.logger.debug(
        `Saving updated job information: title="${job.title}", company="${job.companyName}"`,
      );
      await job.save();
      this.logger.debug(
        `Job saved successfully with ID: ${job._id.toString()}`,
      );
      this.logger.debug(`Starting application processing for job URL: ${url}`);
      await this.applicationsService.startProcessingByUrl(url, job);
      this.logger.log(`Successfully updated job from webhook with URL: ${url}`);
    } catch (error) {
      this.logger.error(
        `Error updating job from webhook with URL: ${url}`,
        error,
      );
      throw error;
    }
  }

  async create(createJobDto: CreateJobDto): Promise<Job> {
    try {
      this.logger.log(`Creating new job with URL: ${createJobDto.url}`);
      this.logger.debug(`Job creation data: ${JSON.stringify(createJobDto)}`);
      const createdJob = await this.jobs.create(createJobDto);
      this.logger.log(
        `Successfully created job with ID: ${createdJob._id.toString()}, URL: ${createJobDto.url}`,
      );
      return createdJob;
    } catch (error) {
      this.logger.error(
        `Failed to create job with URL: ${createJobDto.url}`,
        error,
      );
      throw error;
    }
  }

  async findAll(): Promise<Job[]> {
    try {
      this.logger.log('Fetching all jobs');
      const jobs = await this.jobs.find();
      this.logger.debug(`Successfully fetched ${jobs.length} jobs`);
      this.logger.debug(`Job IDs: ${jobs.map((job) => job._id).join(', ')}`);
      return jobs;
    } catch (error) {
      this.logger.error('Error fetching all jobs', error);
      throw error;
    }
  }

  async update(id: string, updateJobDto: UpdateJobDto): Promise<Job | null> {
    try {
      this.logger.log(`Updating job with ID: ${id}`);
      this.logger.debug(`Update data: ${JSON.stringify(updateJobDto)}`);

      const updatedJob = await this.jobs.findByIdAndUpdate(id, updateJobDto, {
        new: true,
      });
      if (!updatedJob) {
        this.logger.warn(`Job not found for update with ID: ${id}`);
      } else {
        this.logger.log(
          `Successfully updated job with ID: ${id}, title: ${updatedJob.title}`,
        );
      }
      return updatedJob;
    } catch (error) {
      this.logger.error(`Error updating job with ID: ${id}`, error);
      throw error;
    }
  }

  async remove(id: string): Promise<Job | null> {
    try {
      this.logger.log(`Removing job with ID: ${id}`);
      const removedJob = await this.jobs.findByIdAndDelete(id);
      if (!removedJob) {
        this.logger.warn(`Job not found for removal with ID: ${id}`);
      } else {
        this.logger.log(
          `Successfully removed job with ID: ${id}, title: ${removedJob.title}`,
        );
      }
      return removedJob;
    } catch (error) {
      this.logger.error(`Error removing job with ID: ${id}`, error);
      throw error;
    }
  }
}
