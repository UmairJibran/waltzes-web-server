import { HttpException, Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { User as UserEntity } from './entities/user.entity';
import { Model, ObjectId } from 'mongoose';
import { SqsProducerService } from 'src/aws/sqs-producer/sqs-producer.service';
import { createHash } from 'crypto';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private users: Model<User>,
    private readonly sqsProducerService: SqsProducerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly configService: ConfigService,
  ) {}

  async isUserPro({
    id,
    email,
  }: {
    id?: string;
    email?: string;
  }): Promise<boolean> {
    let userEmail = email;
    if (!userEmail) {
      const user = await this.users.findById(id);
      if (!user) {
        throw new Error('User not found');
      }
      userEmail = user.email;
    }

    const subscription = await this.subscriptionsService.findByEmail(
      userEmail,
      {
        active: true,
      },
    );

    return subscription ? true : false;
  }

  async findOne(id: string): Promise<Partial<UserEntity> | null> {
    const user = await this.users.findById(id);

    if (user) {
      const isUserPro = await this.isUserPro({
        id,
        email: user.email,
      });
      const response: Partial<UserEntity & { isPro: boolean }> = {
        _id: String(user.id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        portfolioUrl: user.portfolioUrl,
        linkedinUsername: user.linkedinUsername,
        githubUsername: user.githubUsername,
        additionalInstructions: user.additionalInstructions,
        role: user.role,
        isPro: isUserPro ? true : false,
      };

      return response;
    }
    return null;
  }

  async getUserLinkedin(id: string): Promise<object | undefined> {
    const user = await this.users.findById(id);

    if (user) {
      return user.linkedinScrapedData;
    }
    return;
  }

  async updateUserLinkedin(
    id: string,
    linkedinScrapedData: object,
  ): Promise<object | undefined> {
    const user = await this.users.findById(id);

    if (user) {
      user.linkedinScrapedData = linkedinScrapedData;
      await user.save();
      return user.linkedinScrapedData;
    }
    return;
  }

  async findOneByEmail(email: string): Promise<UserEntity | null> {
    try {
      this.logger.debug(`Finding user by email: ${email}`);
      const user = await this.users.findOne({
        email,
      });
      if (!user) {
        this.logger.debug(`User not found with email: ${email}`);
        return null;
      } else {
        this.logger.debug(`Found user with email: ${email}`);
      }

      const response: UserEntity = {
        _id: String(user.id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        portfolioUrl: user.portfolioUrl,
        linkedinUsername: user.linkedinUsername,
        githubUsername: user.githubUsername,
        additionalInstructions: user.additionalInstructions,
        password: user.password,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isVerified: user.isVerified,
        verificationToken: user.verificationToken,
      };

      return response;
    } catch (error) {
      this.logger.error(`Error finding user by email: ${email}`, error);
      throw error;
    }
  }

  async verifyUserByToken(token: string): Promise<
    | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
      }
    | false
  > {
    try {
      this.logger.debug(`Finding user by token: ${token}`);
      const user = await this.users.findOne({
        verificationToken: token,
      });
      if (!user) {
        this.logger.debug(`User not found with token: ${token}`);
        return false;
      } else {
        this.logger.debug(`Found user with token: ${token}`);
      }

      user.verificationToken = undefined;
      user.isVerified = true;
      await user.save();

      return {
        _id: String(user.id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      };
    } catch (error) {
      this.logger.error(`Error finding user by token: ${token}`, error);
      throw error;
    }
  }

  async requestLatestDataFromLinkedin(id: string): Promise<void> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    if (!user.linkedinUsername) {
      throw new HttpException(
        'You need to have a linkedin username to do this, head over to your account to add it',
        400,
      );
    }

    const isUserPro = await this.isUserPro({
      id,
      email: user.email,
    });

    if (!isUserPro) {
      throw new HttpException(
        'You need to have an active subscription to do this',
        400,
      );
    }

    const baseUrl: string = await this.configService.getOrThrow('baseUrl');
    const callbackUrl = new URL(
      [baseUrl, '/api/_internal/users/', user._id, '/linkedin'].join(''),
    );

    const checkValue: string = createHash('sha256')
      .update(user.password)
      .digest('hex');
    callbackUrl.searchParams.append('check-value', checkValue);
    await this.sqsProducerService.sendMessage(
      {
        linkedinUsername: user.linkedinUsername,
        callbackUrl: callbackUrl.toString(),
      },
      'linkedinScraper',
      id + user.linkedinUsername,
      id + user.linkedinUsername,
    );
  }

  async create(createUserDto: CreateUserDto): Promise<UserEntity | null> {
    try {
      this.logger.debug(`Creating new user with email: ${createUserDto.email}`);
      const user = await this.users.create(createUserDto);
      this.logger.debug(`Successfully created user: ${createUserDto.email}`);
      const createdId = String(user.id);
      const response: UserEntity = {
        _id: createdId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        portfolioUrl: user.portfolioUrl,
        linkedinUsername: user.linkedinUsername,
        githubUsername: user.githubUsername,
        additionalInstructions: user.additionalInstructions,
        password: user.password,
        role: user.role,
        verificationToken: user.verificationToken,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isVerified: user.isVerified,
      };
      return response;
    } catch (error) {
      this.logger.error(`Failed to create user: ${createUserDto.email}`, error);
      throw error;
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserEntity> {
    try {
      this.logger.debug(`Updating user with ID: ${id}`);
      const user = await this.users.findById(id);

      if (!user) {
        throw new HttpException('User not found', 404);
      }

      user.githubUsername = updateUserDto.githubUsername;
      user.linkedinUsername = updateUserDto.linkedinUsername;
      user.portfolioUrl = updateUserDto.portfolioUrl;
      user.additionalInstructions = updateUserDto.additionalInstructions;
      user.phone = updateUserDto.phone;
      if (updateUserDto.firstName) user.firstName = updateUserDto.firstName;
      if (updateUserDto.lastName) user.lastName = updateUserDto.lastName;

      await user.save();

      this.logger.debug(`Successfully updated user with ID: ${id}`);
      const response: UserEntity = {
        _id: String(user.id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        portfolioUrl: user.portfolioUrl,
        linkedinUsername: user.linkedinUsername,
        githubUsername: user.githubUsername,
        additionalInstructions: user.additionalInstructions,
        password: user.password,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
      return response;
    } catch (error) {
      this.logger.error(`Error updating user with ID: ${id}`, error);
      throw error;
    }
  }

  async updateLinkedinFromWebhook(
    id: string,
    linkedinScrapedData: object,
    checkValue: string,
  ): Promise<object | undefined> {
    try {
      this.logger.debug(`Updating LinkedIn data for user with ID: ${id}`);
      const user = await this.users.findById(id);

      if (user) {
        const calculatedCheckValue: string = createHash('sha256')
          .update(user.password)
          .digest('hex');
        if (checkValue === calculatedCheckValue) {
          user.linkedinScrapedData = linkedinScrapedData;
          await user.save();
          this.logger.debug(
            `Successfully updated LinkedIn data for user with ID: ${id}`,
          );
          return user.linkedinScrapedData;
        }
      }
      return;
    } catch (error) {
      this.logger.error(
        `Error updating LinkedIn data for user with ID: ${id}`,
        error,
      );
      throw error;
    }
  }

  async recordMeteredUsage(
    userId: ObjectId,
    meterAmount: number = 1,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new HttpException('User not found', 404);
    }
    await this.subscriptionsService.meteredUsage(
      user.email,
      String(user._id),
      meterAmount,
    );
  }

  async validatePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    try {
      this.logger.debug('Validating password');
      const isValid = await bcrypt.compare(password, hashedPassword);
      this.logger.debug(`Password validation result: ${isValid}`);
      return isValid;
    } catch (error) {
      this.logger.error('Error validating password', error);
      throw error;
    }
  }
}
