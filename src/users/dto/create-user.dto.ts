import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';

enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export class CreateUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  portfolioUrl?: string;

  @IsString()
  @IsOptional()
  linkedinUsername?: string;

  @IsString()
  @IsOptional()
  githubUsername?: string;

  @IsString()
  @IsOptional()
  @IsEnum(UserRole)
  role: 'admin' | 'user';

  @IsString()
  @IsOptional()
  verificationToken?: string;

  @IsString()
  password: string;
}
