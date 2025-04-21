import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Logger,
  Query,
  Get,
  Response,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { Public } from './constants';
import { RegisterUserDto } from './dto/register-user.dto';
import {
  InvalidCredentialsException,
  ValidationException,
  InvalidTokenException,
} from '../common/exceptions/application.exceptions';
import type { Response as ExResponse } from 'express';
import { ConfigService } from '@nestjs/config';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface ValidationError {
  name: string;
  errors: Record<string, string[]>;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Public()
  @Get('verify-user')
  async verifyUser(@Query('token') token: string, @Response() res: ExResponse) {
    this.logger.log(`Attempting to Verify token: ${token}`);
    const result = await this.authService.verifyUser(token);
    this.logger.log(`Successfully verified token: ${token}`);
    if (result) {
      this.logger.log(`Token is valid: ${token}`);
      const redirectUrl = this.configService.getOrThrow<string>('webApp.url');
      return res.redirect(redirectUrl);
    }
    this.logger.error(`Token is invalid: ${token}`);
    throw new InvalidTokenException();
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('login')
  async signIn(@Body() signInDto: LoginUserDto) {
    try {
      this.logger.log(`Attempting login for user: ${signInDto.email}`);
      const result = await this.authService.signIn(
        signInDto.email,
        signInDto.password,
      );
      this.logger.log(`Successfully logged in user: ${signInDto.email}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed login attempt for user: ${signInDto.email}`,
        error,
      );
      if (error instanceof Error && error.message === 'Invalid credentials') {
        throw new InvalidCredentialsException();
      }
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('register')
  async signUp(@Body() registerUserDto: RegisterUserDto) {
    try {
      this.logger.log(
        `Attempting registration for user: ${registerUserDto.email}`,
      );
      const result = await this.authService.register(registerUserDto);
      this.logger.log(`Successfully registered user: ${registerUserDto.email}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed registration attempt for user: ${registerUserDto.email}`,
        error,
      );
      if (this.isValidationError(error)) {
        throw new ValidationException(error.errors);
      }
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      this.logger.log(
        `Attempting forgot password for: ${forgotPasswordDto.email}`,
      );
      const result = await this.authService.forgotPassword(
        forgotPasswordDto.email,
      );
      this.logger.log(
        `Forgot password process completed for: ${forgotPasswordDto.email}`,
      );
      return { success: result };
    } catch (error) {
      this.logger.error(
        `Failed forgot password attempt for: ${forgotPasswordDto.email}`,
        error,
      );
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    try {
      this.logger.log('Attempting password reset');
      const result = await this.authService.resetPassword(
        resetPasswordDto.token,
        resetPasswordDto.password,
      );
      this.logger.log('Password reset successful');
      return { success: result };
    } catch (error) {
      this.logger.error('Failed password reset attempt', error);
      if (
        error instanceof Error &&
        error.message === 'Invalid or expired token'
      ) {
        throw new InvalidTokenException();
      }
      throw error;
    }
  }

  private isValidationError(error: unknown): error is ValidationError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'ValidationError' &&
      'errors' in error
    );
  }
}
