import { IsEmail, IsString, MinLength, IsInt, Min, Max, IsIn } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  displayName: string;

  @IsInt()
  @Min(18)
  @Max(100)
  age: number;

  @IsIn(['male', 'female', 'non-binary', 'other'])
  gender: string;
}
