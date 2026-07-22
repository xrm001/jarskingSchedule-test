import type { AuthenticatedUser } from '../../domain/model';

export interface RequestWithUser {
  user?: AuthenticatedUser & { isTestRole?: boolean; testRole?: string };
  realUser?: AuthenticatedUser;
}
