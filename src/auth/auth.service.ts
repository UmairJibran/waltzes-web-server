import {
  HttpException,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { SqsProducerService } from 'src/aws/sqs-producer/sqs-producer.service';
import * as bcrypt from 'bcrypt';

interface JwtPayload {
  sub: string;
  email: string;
}

interface EmailQueueMessage {
  to: string;
  emailType: string;
  template: string;
  templateData: Record<string, any>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly sqsProducerService: SqsProducerService,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(
    email: string,
    password: string,
  ): Promise<{ access_token: string }> {
    try {
      this.logger.debug(`Attempting to sign in user with email: ${email}`);
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        this.logger.warn(`Sign in attempt failed - User not found: ${email}`);
        throw new HttpException('Invalid email/password, please retry', 400);
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        this.logger.warn(
          `Sign in attempt failed - Invalid password for user: ${email}`,
        );
        throw new HttpException('Invalid email/password, please retry', 400);
      }

      const payload: Partial<JwtPayload> = {
        sub: user._id,
        email: user.email,
      };
      this.logger.debug(`Successfully signed in user: ${email}`);
      return {
        access_token: await this.jwtService.signAsync(payload),
      };
    } catch (error) {
      this.logger.error(`Error during sign in for user: ${email}`, error);
      throw error;
    }
  }

  async register(user: RegisterUserDto) {
    try {
      this.logger.debug(
        `Attempting to register new user with email: ${user.email}`,
      );
      const existingUser = await this.usersService.findOneByEmail(user.email);
      if (existingUser) {
        this.logger.warn(
          `Registration attempt failed - User already exists: ${user.email}`,
        );
        throw new HttpException('User with this email exists', 400);
      }
      const hashedPassword = await bcrypt.hash(user.password, 10);
      const createdUser = await this.usersService.create({
        email: user.email,
        password: hashedPassword,
        role: 'admin',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        portfolioUrl: user.portfolioUrl || '',
        linkedinUsername: user.linkedinUsername || '',
        githubUsername: user.githubUsername || '',
      });
      if (!createdUser) {
        this.logger.error(`Failed to create user: ${user.email}`);
        throw new UnauthorizedException();
      }

      const payload: Partial<JwtPayload> = {
        sub: createdUser._id,
        email: createdUser.email,
      };

      const emailQueueMessage: EmailQueueMessage = {
        to: createdUser.email,
        emailType: 'templated',
        template: 'welcome',
        templateData: {
          firstName: createdUser.firstName,
          verificationLink: '---',
        },
      };

      await this.sqsProducerService.sendMessage(
        emailQueueMessage,
        'sendEmail',
        createdUser._id,
        createdUser._id,
      );

      this.logger.debug(`Successfully registered new user: ${user.email}`);
      return {
        access_token: await this.jwtService.signAsync(payload),
      };
    } catch (error) {
      this.logger.error(
        `Error during registration for user: ${user.email}`,
        error,
      );
      throw error;
    }
  }
}
