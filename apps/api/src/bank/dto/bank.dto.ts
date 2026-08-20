import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CsvColumnMappingDto {
  @ApiProperty({ example: 'Data' })
  @IsString()
  date: string;

  @ApiProperty({ example: 'Descrição' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'Valor', description: 'Use amount OR debit+credit' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ example: 'Débito' })
  @IsOptional()
  @IsString()
  debit?: string;

  @ApiPropertyOptional({ example: 'Crédito' })
  @IsOptional()
  @IsString()
  credit?: string;

  @ApiPropertyOptional({ example: 'Saldo' })
  @IsOptional()
  @IsString()
  balance?: string;

  @ApiPropertyOptional({ example: 'Referência' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreateCsvTemplateDto {
  @ApiProperty({ example: 'Millennium BCP' })
  @IsString()
  name: string;

  @ApiProperty({ type: CsvColumnMappingDto })
  @IsObject()
  mapping: CsvColumnMappingDto;

  @ApiPropertyOptional({ example: 'DD/MM/YYYY', default: 'DD/MM/YYYY' })
  @IsOptional()
  @IsString()
  dateFormat?: string;

  @ApiPropertyOptional({ example: ',', default: ',' })
  @IsOptional()
  @IsString()
  decimalSep?: string;

  @ApiPropertyOptional({ example: '.', default: '.' })
  @IsOptional()
  @IsString()
  thousandSep?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasHeader?: boolean;
}

export class PreviewCsvDto {
  @ApiProperty({ type: CsvColumnMappingDto })
  @IsObject()
  mapping: CsvColumnMappingDto;

  @ApiPropertyOptional({ example: 'DD/MM/YYYY' })
  @IsOptional()
  @IsString()
  dateFormat?: string;

  @ApiPropertyOptional({ example: ',' })
  @IsOptional()
  @IsString()
  decimalSep?: string;

  @ApiPropertyOptional({ example: '.' })
  @IsOptional()
  @IsString()
  thousandSep?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  hasHeader?: boolean;
}

export class ImportCsvDto extends PreviewCsvDto {
  @ApiPropertyOptional({ description: 'Save as template with this name' })
  @IsOptional()
  @IsString()
  saveAsTemplate?: string;
}

export class BankTransactionQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
