import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Empresa Exemplo Lda' })
  @IsString()
  @MinLength(2)
  tenantName: string;

  @ApiProperty({ example: 'exemplo' })
  @IsString()
  @MinLength(2)
  tenantSlug: string;

  @ApiProperty({ example: '500123456', required: false })
  @IsOptional()
  @IsString()
  tenantNif?: string;

  @ApiProperty({ example: 'admin@exemplo.pt' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  name: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@demo.pt' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'demo', description: 'Tenant slug' })
  @IsString()
  tenantSlug: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class InviteUserDto {
  @ApiProperty({ example: 'operador@exemplo.pt' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Maria Operadora' })
  @IsString()
  name: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OPERATOR })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ example: 'TempPass123!' })
  @IsString()
  @MinLength(8)
  temporaryPassword: string;
}
