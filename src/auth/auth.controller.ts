import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { Public } from './constants';
import { RegisterUserDto } from './dto/register-user.dto';
import {
  InvalidCredentialsException,
  ValidationException,
} from '../common/exceptions/application.exceptions';

interface ValidationError {
  name: string;
  errors: Record<string, string[]>;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

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
