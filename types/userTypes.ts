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
  UpdateUserInput: Input for updating a user
  UpdateUserSuccess: Success response for user update
  DeleteUserInput: Input for deleting a user
  DeleteUserSuccess: Success response for user deletion
  ListUsersInput: Input for listing users with filters
  ListUsersSuccess: Success response with user list
*/

export type UserRole = "admin" | "tech";

import { PaginationInput, PaginationOutput } from "./commonTypes";

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
	updatedAt?: string; // ISO date string, optional
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
/*
CRUD ops for users
C - Create
R - Read
U - Update
D - Delete
all fields optional bc we only update whats given to us
*/

// Update user, updates name, role, email, password, and provides a success message
export type UpdateUserInput = {
	userId: string;
	email?: string;
	password?: string;
	role?: UserRole;
};
export type UpdateUserSuccess = {
	userId: string;
	message: string;
};

// Delete user, provides a success message, not optional, user must need a id before deleting
export type DeleteUserInput = {
	userId: string;
};

export type DeleteUserSuccess = {
	userId: string;
	message: string;
};

// lists users, provides an array of users
/*
CompanyID: Required
Role, limit (number of people to return), offset (takes out first n results): Optional

*/
export type ListUsersInput = PaginationInput<"createdAt" | "updatedAt"> & {
	companyId: string;
	role?: UserRole;
};

export type ListUsersSuccess = PaginationOutput<UserDTO>;
