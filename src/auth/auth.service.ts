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
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

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
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(
    email: string,
    password: string,
  ): Promise<{ access_token: string }> {
    try {
      this.logger.log(`Attempting to sign in user with email: ${email}`);
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        this.logger.warn(`Sign in attempt failed - User not found: ${email}`);
        throw new HttpException('Invalid email/password, please retry', 400);
      }

      if (!user.isVerified) {
        this.logger.warn(
          `Sign in attempt failed - User not verified: ${email}`,
        );
        throw new HttpException(
          'User not verified, please check your email for verification link',
          400,
        );
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
      this.logger.log(`Successfully signed in user: ${email}`);
      return {
        access_token: await this.jwtService.signAsync(payload),
      };
    } catch (error) {
      this.logger.error(`Error during sign in for user: ${email}`, error);
      throw error;
    }
  }

  async verifyUser(token: string): Promise<boolean> {
    try {
      const verifiedUser = await this.usersService.verifyUserByToken(token);
      if (!verifiedUser) {
        this.logger.warn(`Verification failed - Invalid token: ${token}`);
        throw new HttpException('Invalid token', 400);
      }

      const emailQueueMessage: EmailQueueMessage = {
        to: verifiedUser.email,
        emailType: 'templated',
        template: 'onboarding',
        templateData: {
          firstName: verifiedUser.firstName,
        },
      };

      await this.sqsProducerService.sendMessage(
        emailQueueMessage,
        'sendEmail',
        'on-boarding-' + verifiedUser._id,
        'on-boarding-' + verifiedUser._id,
      );

      return true;
    } catch (error) {
      this.logger.error(`Error during verifying token: ${token}`, error);
      throw error;
    }
  }

  async forgotPassword(email: string): Promise<boolean> {
    try {
      this.logger.log(`Processing forgot password request for: ${email}`);
      const userData = await this.usersService.createPasswordResetToken(email);

      if (!userData) {
        // Don't reveal that the email doesn't exist for security reasons
        this.logger.log(`No user found with email ${email} for password reset`);
        return true;
      }

      const baseUrl: string = await this.configService.getOrThrow('webApp.url');
      const resetLink = `${baseUrl}/reset-password?token=${userData.token}`;

      const emailQueueMessage: EmailQueueMessage = {
        to: userData.email,
        emailType: 'templated',
        template: 'password-reset',
        templateData: {
          firstName: userData.firstName,
          resetLink: resetLink,
        },
      };

      await this.sqsProducerService.sendMessage(
        emailQueueMessage,
        'sendEmail',
        'password-reset-' + email,
        'password-reset-' + email,
      );

      this.logger.log(`Password reset email sent to: ${email}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error processing forgot password for: ${email}`,
        error,
      );
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      this.logger.log('Processing password reset request');
      const result = await this.usersService.resetPassword(token, newPassword);

      if (!result) {
        this.logger.warn(`Password reset failed - Invalid or expired token`);
        throw new HttpException('Invalid or expired token', 400);
      }

      this.logger.log('Password reset successful');
      return true;
    } catch (error) {
      this.logger.error('Error processing password reset', error);
      throw error;
    }
  }

  async register(user: RegisterUserDto) {
    try {
      this.logger.log(
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
        role: 'user',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        portfolioUrl: user.portfolioUrl || '',
        linkedinUsername: user.linkedinUsername || '',
        githubUsername: user.githubUsername || '',
        verificationToken: randomBytes(32).toString('hex'),
      });
      if (!createdUser) {
        this.logger.error(`Failed to create user: ${user.email}`);
        throw new UnauthorizedException();
      }

      if (createdUser.verificationToken) {
        const baseUrl: string = await this.configService.getOrThrow('baseUrl');
        const verificationLink = [baseUrl, '/api/auth/verify-user'].join('');
        const parsedUrl = new URL(verificationLink);
        parsedUrl.searchParams.append('token', createdUser.verificationToken);

        const emailQueueMessage: EmailQueueMessage = {
          to: createdUser.email,
          emailType: 'templated',
          template: 'welcome',
          templateData: {
            firstName: createdUser.firstName,
            verificationLink: parsedUrl,
          },
        };

        await this.sqsProducerService.sendMessage(
          emailQueueMessage,
          'sendEmail',
          'welcome-' + createdUser._id,
          'welcome-' + createdUser._id,
        );
      }

      this.logger.log(`Successfully registered new user: ${user.email}`);
      return {
        registered: true,
        emailSent: !!createdUser.verificationToken,
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
