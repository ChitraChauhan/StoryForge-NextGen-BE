import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';
import { log } from 'console';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;
    const { password: _pw, ...result } = user.toObject();
    return result;
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    if (dto.phoneNumber) {
      const existingPhone = await this.usersService.findByPhoneNumber(dto.phoneNumber);
      if (existingPhone) throw new ConflictException('Phone number already in use');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      email: dto.email.toLowerCase(),
      username: dto.username,
      password: hashed,
      phoneNumber: dto.phoneNumber,
    });

    const tokens = await this.getTokens(user._id.toString(), user.email, user.username);
    await this.updateRefreshTokenHash(user._id.toString(), tokens.refresh_token);

    return {
      ...tokens,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
      },
    };
  }

  async login(user: any) {
    const tokens = await this.getTokens(user._id.toString(), user.email, user.username);
    await this.updateRefreshTokenHash(user._id.toString(), tokens.refresh_token);

    return {
      ...tokens,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
      },
    };
  }

  async getTokens(userId: string, email: string, username: string) {
    const payload = { sub: userId, email, username };
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'storyforge_jwt_refresh_super_secret_key_2024',
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      }),
    ]);
    return { access_token, refresh_token };
  }

  async updateRefreshTokenHash(userId: string, refreshToken: string | null) {
    if (refreshToken) {
      const hash = await bcrypt.hash(refreshToken, 10);
      await this.usersService.update(userId, { refreshToken: hash });
    } else {
      await this.usersService.update(userId, { refreshToken: '' });
    }
  }

  async logout(userId: string) {
    await this.updateRefreshTokenHash(userId, null);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access Denied');
    }
    const refreshTokenMatches = refreshToken === user.refreshToken;
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokens = await this.getTokens(user._id.toString(), user.email, user.username);
    await this.updateRefreshTokenHash(user._id.toString(), tokens.refresh_token);

    return {
      ...tokens,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
      },
    };
  }

  async requestMobileOtp(phoneNumber: string) {
    const user = await this.usersService.findByPhoneNumber(phoneNumber);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.usersService.update(user._id.toString(), {
      otpCode,
      otpExpiresAt,
    });

    // Simulate sending SMS
    console.log(`[SMS Simulator] To: ${phoneNumber} - Your StoryForge OTP is: ${otpCode}`);

    return { message: 'OTP sent successfully', otpCode };
  }

  async loginWithMobileOtp(phoneNumber: string, otp: string) {
    const user = await this.usersService.findByPhoneNumber(phoneNumber);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.otpCode || user.otpCode !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new UnauthorizedException('OTP has expired');
    }

    // Clear OTP after successful login
    await this.usersService.update(user._id.toString(), {
      otpCode: undefined,
      otpExpiresAt: undefined,
    });

    return this.login(user);
  }
}
