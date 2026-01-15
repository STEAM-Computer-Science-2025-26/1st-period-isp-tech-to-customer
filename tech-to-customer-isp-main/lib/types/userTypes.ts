/* File: userTypes.ts
Overview: Type definitions for user-related operations
Types:
  UserRole: Valid user roles (admin or tech)
  UserDTO: Canonical user shape exposed via API (never includes secrets)
  CreateUserInput: Input for creating a new user
  CreateUserSuccess: Success response for user creation
  LoginInput: Input for user login
  LoginSuccess: Success response with token and user data
  GetUserInput: Input for fetching a user
  GetUserSuccess: Success response with user data
*/

export type UserRole = "admin" | "tech";

/**
 * Canonical user shape exposed via API
 * (never includes secrets)
 */
export type UserDTO = {
  id: string;
  email: string;
  role: UserRole;
  companyId: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string, optional
};

/**
 * Create user
 */
export type CreateUserInput = {
  email: string;
  password: string;
  role: UserRole;
  companyId: string;
};

export type CreateUserSuccess = {
  userId: string;
};

/**
 * Login
 */
export type LoginInput = {
  email: string;
  password: string;
};

export type LoginSuccess = {
  token: string;
  user: UserDTO;
};

/**
 * Get user
 */
export type GetUserInput = {
  userId: string;
};

export type GetUserSuccess = {
  user: UserDTO;
};