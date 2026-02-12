import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { queryOne } from "@/db/connection";
import { LoginInput, LoginSuccess, UserDTO } from "@/services/types/userTypes";
import { getPublicError } from "@/services/publicErrors";

// Helper to convert DB row into UserDTO + passwordHash
function mapUser(row: Record<string, any>): UserDTO & { passwordHash: string } {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    companyId: row.companyId,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginInput = await request.json();

    if (!body.email || !body.password) {
      return NextResponse.json(getPublicError("MISSING_REQUIRED_FIELD"), {
        status: 400
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const row = await queryOne(
      (sql) => sql`
        SELECT 
          id,
          email,
          role,
          company_id as "companyId",
          password_hash as "passwordHash",
          created_at as "createdAt",
          created_at as "updatedAt"
        FROM users
        WHERE email = ${body.email}
      `
    );

    if (!row) {
      return NextResponse.json(getPublicError("INVALID_CREDENTIALS"), {
        status: 401
      });
    }

    const user = mapUser(row);

    const isValidPassword = user.passwordHash === body.password;
    if (!isValidPassword) {
      return NextResponse.json(getPublicError("INVALID_CREDENTIALS"), {
        status: 401
      });
    }

    // REAL JWT that Fastify can verify
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        companyId: user.companyId
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    const response: LoginSuccess = {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(getPublicError("SERVER_ERROR"), { status: 500 });
  }
}
