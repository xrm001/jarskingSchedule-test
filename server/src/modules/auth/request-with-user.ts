import type { AuthenticatedUser } from '../../domain/model';

export interface RequestWithUser { user?: AuthenticatedUser }
