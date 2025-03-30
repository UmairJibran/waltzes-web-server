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
    const baseUrl: string = await this.configService.getOrThrow('baseUrl');
    const callbackUrl = new URL(
      [baseUrl, '/api/_internal/job-scraper'].join(''),
    );
    callbackUrl.searchParams.append('job-url', url);
    await this.sqsProducerService.sendMessage(
      {
        jobUrl: url,
        callbackUrl: callbackUrl.toString(),
      },
      'jobScraper',
      url,
      url,
    );
    const createdJob = await this.jobs.create({ url, status: 'pending' });
    return createdJob;
  }

  async findByUrl(url: string) {
    return await this.jobs.findOne({ url });
  }

  async findById(id: string) {
    try {
      this.logger.debug(`Finding job by ID: ${id}`);
      const job = await this.jobs.findById(id);
      if (!job) {
        this.logger.debug(`Job not found with ID: ${id}`);
      } else {
        this.logger.debug(`Found job with ID: ${id}`);
      }
      return job;
    } catch (error) {
      this.logger.error(`Error finding job by ID: ${id}`, error);
      throw error;
    }
  }

  async updateFromWebhook(url: string, updateJobDto: UpdateJobDto) {
    try {
      this.logger.debug(`Updating job from webhook with URL: ${url}`);
      const job = await this.findByUrl(url);
      if (!job) {
        this.logger.warn(`Job not found for webhook update with URL: ${url}`);
        return;
      }
      job.description = updateJobDto.description;
      job.title = updateJobDto.title ?? 'N/A';
      job.companyName = updateJobDto.companyName ?? 'N/A';
      job.location = updateJobDto.location ?? 'N/A';
      job.salary = updateJobDto.salary ?? 'N/A';
      job.skills = updateJobDto.skills;
      job.status = 'done';
      await job.save();
      await this.applicationsService.startProcessingByUrl(url, job);
      this.logger.debug(
        `Successfully updated job from webhook with URL: ${url}`,
      );
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
      this.logger.debug(`Creating new job with URL: ${createJobDto.url}`);
      const createdJob = await this.jobs.create(createJobDto);
      this.logger.debug(
        `Successfully created job with URL: ${createJobDto.url}`,
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
      this.logger.debug('Fetching all jobs');
      const jobs = await this.jobs.find();
      this.logger.debug(`Successfully fetched ${jobs.length} jobs`);
      return jobs;
    } catch (error) {
      this.logger.error('Error fetching all jobs', error);
      throw error;
    }
  }

  async update(id: string, updateJobDto: UpdateJobDto): Promise<Job | null> {
    try {
      this.logger.debug(`Updating job with ID: ${id}`);
      const updatedJob = await this.jobs.findByIdAndUpdate(id, updateJobDto, {
        new: true,
      });
      if (!updatedJob) {
        this.logger.warn(`Job not found for update with ID: ${id}`);
      } else {
        this.logger.debug(`Successfully updated job with ID: ${id}`);
      }
      return updatedJob;
    } catch (error) {
      this.logger.error(`Error updating job with ID: ${id}`, error);
      throw error;
    }
  }

  async remove(id: string): Promise<Job | null> {
    try {
      this.logger.debug(`Removing job with ID: ${id}`);
      const removedJob = await this.jobs.findByIdAndDelete(id);
      if (!removedJob) {
        this.logger.warn(`Job not found for removal with ID: ${id}`);
      } else {
        this.logger.debug(`Successfully removed job with ID: ${id}`);
      }
      return removedJob;
    } catch (error) {
      this.logger.error(`Error removing job with ID: ${id}`, error);
      throw error;
    }
  }
}
