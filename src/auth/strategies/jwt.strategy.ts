import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'storyforge_jwt_super_secret_key_2024',
    });
  }

  async validate(payload: { sub: string; email: string; username: string }) {
    const user = await this.usersService.findById(payload.sub);
    return {
      _id: payload.sub,
      email: payload.email,
      username: payload.username,
      ...user?.toObject(),
    };
  }
}
