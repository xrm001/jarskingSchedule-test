import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../domain/model';

export const REQUIRED_ROLES = 'requiredRoles';
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);
