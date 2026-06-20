import { Role } from "../db";

declare global {
  namespace Express {
    interface Request {
      restaurant_id?: string;
      user?: {
        id: string;
        email: string;
        role: Role;
        restaurant_id: string;
      };
    }
  }
}
