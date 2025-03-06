// src/lib/auth/staff-registration.ts
import { prisma } from '@/lib/prisma';
import { hashPassword } from './utils';
import { validateInvitation, updateInvitationStatus } from './invitation';

export type StaffRegistrationData = {
  token: string;
  name: string;
  password: string;
};

export type StaffRegistrationResult = {
  success: boolean;
  userId?: string;
  error?: string;
};

/**
 * 招待からスタッフを登録する
 */
export async function registerStaff(data: StaffRegistrationData): Promise<StaffRegistrationResult> {
  const { token, name, password } = data;

  try {
    // 招待の検証（validateInvitation関数の戻り値と一致させる）
    const invitation = await prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation || invitation.used || invitation.expires < new Date()) {
      return {
        success: false,
        error: '無効な招待です。',
      };
    }

    // パスワードのハッシュ化
    const hashedPassword = await hashPassword(password);

    // メールアドレスがnullの場合はエラー
    if (!invitation.email) {
      return {
        success: false,
        error: '招待メールアドレスが見つかりません。',
      };
    }

    // ユーザー作成
    const user = await prisma.user.create({
      data: {
        email: invitation.email,
        name,
        password: hashedPassword,
        role: invitation.role,
        storeId: invitation.storeId,
      },
    });

    // 招待ステータスを更新
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { used: true },
    });

    return {
      success: true,
      userId: user.id,
    };
  } catch (error) {
    console.error('Staff registration error:', error);
    return {
      success: false,
      error: 'スタッフ登録中にエラーが発生しました。',
    };
  }
}

/**
 * 招待なしでオーナーが直接スタッフを登録する（緊急用）
 */
export async function directRegisterStaff(
  storeId: string,
  userData: {
    email: string;
    name: string;
    role: string;
    password: string;
  }
): Promise<StaffRegistrationResult> {
  const { email, name, role, password } = userData;

  try {
    // メールアドレスの重複をチェック
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        storeId,
      },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'このメールアドレスは既にこの店舗で使用されています。',
      };
    }

    // パスワードのハッシュ化
    const hashedPassword = await hashPassword(password);

    // ユーザー作成
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: role as any, // 型の問題を一時的に回避
        storeId,
      },
    });

    return {
      success: true,
      userId: user.id,
    };
  } catch (error) {
    console.error('Direct staff registration error:', error);
    return {
      success: false,
      error: 'スタッフの直接登録中にエラーが発生しました。',
    };
  }
}