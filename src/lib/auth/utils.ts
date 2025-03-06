// src/lib/auth/utils.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

/**
 * パスワードをハッシュ化する
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * パスワードを比較する
 */
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * JWTトークンを生成する
 */
export function generateToken(userId: string, role: Role, storeId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  
  if (!secret) {
    throw new Error('JWT secret is not defined in environment variables');
  }

  return jwt.sign(
    {
      userId,
      role,
      storeId,
    },
    secret,
    { expiresIn: '7d' }
  );
}

/**
 * JWTトークンを検証する
 */
export function verifyToken(token: string): any {
  const secret = process.env.NEXTAUTH_SECRET;
  
  if (!secret) {
    throw new Error('JWT secret is not defined in environment variables');
  }

  try {
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

/**
 * ロールに基づいたアクセス制御チェック
 */
export function hasPermission(userRole: Role, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(userRole);
}