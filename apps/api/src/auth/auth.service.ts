import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, InviteUserDto } from './dto/auth.dto';
import { UserRole, AuditAction } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (existing) {
      throw new ConflictException('Tenant slug already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          nif: dto.tenantNif,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: UserRole.ADMIN,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          action: AuditAction.create_tenant,
          entityType: 'tenant',
          entityId: tenant.id,
          metadata: { slug: tenant.slug },
        },
      });

      // Default folder rule
      await tx.folderRule.create({
        data: {
          tenantId: tenant.id,
          name: 'Padrão Ano/Mês/Tipo',
          priority: 0,
          conditions: {},
          folderPattern: '/{Ano}/{Mes}/{Tipo}/{Entidade}',
        },
      });

      return { tenant, user };
    });

    const tokens = await this.generateTokens(result.user);

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenantId: result.user.tenantId,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: dto.email,
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: AuditAction.login,
        ip,
        userAgent,
      },
    });

    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate token
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.generateTokens(stored.user);
  }

  async inviteUser(tenantId: string, inviterId: string, dto: InviteUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: {
        tenantId_email: { tenantId, email: dto.email },
      },
    });
    if (existing) {
      throw new ConflictException('User already exists in this tenant');
    }

    const passwordHash = await bcrypt.hash(dto.temporaryPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: inviterId,
        action: AuditAction.invite_user,
        entityType: 'user',
        entityId: user.id,
        metadata: { email: dto.email, role: dto.role },
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private async generateTokens(user: { id: string; email: string; tenantId: string; role: UserRole }) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(
      { ...payload, type: 'access' },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN') || '15m',
      },
    );

    const refreshToken = uuidv4();
    const expiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d';
    const expiresAt = new Date();
    // simple parse: assume Nd
    const days = parseInt(expiresIn) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        isActive: true,
      },
    });
  }
}
