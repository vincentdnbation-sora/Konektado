import { IsString, MinLength, MaxLength, IsInt, Min, Max, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class AnonymousDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(30)
  username: string;

  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  age: number;

  @IsIn(['male', 'female', 'non-binary', 'other'])
  gender: string;
}
