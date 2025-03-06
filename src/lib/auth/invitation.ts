// src/lib/auth/invitation.ts
import { Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendInvitationEmail } from '@/lib/email';

export type InvitationData = {
  email: string;
  role: Role;
  storeId: string;
  invitedBy: string; // 招待者のユーザーID
  token?: string;    // テスト用のオプショナルトークン
};

export type InvitationResult = {
  success: boolean;
  invitationId?: string;
  token?: string;
  error?: string;
};

/**
 * スタッフを招待する
 */
export async function createInvitation(data: InvitationData): Promise<InvitationResult> {
  const { email, role, storeId, invitedBy } = data;

  try {
    // 既に招待されているかチェック
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email,
        storeId,
        used: false,
        expires: {
          gt: new Date()
        }
      },
    });

    if (existingInvitation) {
      return {
        success: false,
        error: 'このメールアドレスには既に招待が送信されています。',
      };
    }

    // 既にユーザーが存在するかチェック
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        storeId,
      },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'このメールアドレスは既にこの店舗のユーザーとして登録されています。',
      };
    }

    // 店舗情報を取得
    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return {
        success: false,
        error: '指定された店舗が見つかりません。',
      };
    }

    // 招待トークンの生成（テスト用のトークンがあれば使用）
    const token = data.token || generateInviteToken();
    
    // 有効期限の設定（48時間後）
    const expires = new Date();
    expires.setHours(expires.getHours() + 48);

    // 招待レコードの作成
    const invitation = await prisma.invitation.create({
      data: {
        email,
        role,
        token,
        expires,
        used: false,
        storeId,
        // invitedById: invitedBy, // スキーマにこのフィールドがない
      },
    });

    // 招待メールの送信
    await sendInvitationEmail(email, token, store.name);

    return {
      success: true,
      invitationId: invitation.id,
      token,
    };
  } catch (error) {
    console.error('Staff invitation error:', error);
    return {
      success: false,
      error: 'スタッフ招待中にエラーが発生しました。',
    };
  }
}

/**
 * 招待のステータスを確認する
 */
export async function validateInvitation(token: string): Promise<{
  isValid: boolean;
  invitation?: any;
  storeName?: string;
  error?: string;
}> {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return {
        isValid: false,
        error: '招待が見つかりません。',
      };
    }

    // 既に使用済みかチェック
    if (invitation.used) {
      return {
        isValid: false,
        error: 'この招待は既に使用されています。',
      };
    }

    // 期限切れかチェック
    const now = new Date();
    if (invitation.expires < now) {
      return {
        isValid: false,
        error: 'この招待は期限切れです。',
      };
    }

    // 店舗情報を取得
    const store = await prisma.store.findUnique({
      where: { id: invitation.storeId },
    });

    return {
      isValid: true,
      invitation,
      storeName: store?.name,
    };
  } catch (error) {
    console.error('Invitation validation error:', error);
    return {
      isValid: false,
      error: '招待の検証中にエラーが発生しました。',
    };
  }
}

/**
 * 招待ステータスを更新する
 */
export async function updateInvitationStatus(
  invitationId: string,
  used: boolean
): Promise<boolean> {
  try {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { used },
    });
    return true;
  } catch (error) {
    console.error('Invitation status update error:', error);
    return false;
  }
}

/**
 * ランダムな招待トークンを生成する
 */
function generateInviteToken(): string {
  // 16バイトのランダムな文字列を生成し、Base64エンコード
  return randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
}