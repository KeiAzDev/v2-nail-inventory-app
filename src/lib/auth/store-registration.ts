// src/lib/auth/store-registration.ts
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './utils';
import { prisma } from '@/lib/prisma';

export type StoreRegistrationData = {
  name: string;
  address?: string;
  phone?: string;
  ownerEmail: string;
  ownerName: string;
  password: string;
};

export type StoreRegistrationResult = {
  success: boolean;
  storeId?: string;
  userId?: string;
  error?: string;
};

/**
 * 新規店舗を登録し、オーナーアカウントを作成する
 */
export async function registerStore(data: StoreRegistrationData): Promise<StoreRegistrationResult> {
  const { name, address, phone, ownerEmail, ownerName, password } = data;

  try {
    // メールアドレスの重複をチェック
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'このメールアドレスは既に使用されています。',
      };
    }

    // 店舗コードの生成（店舗名から生成するシンプルな例）
    const storeCode = generateStoreCode(name);

    // 既存の店舗コードをチェック
    const existingStore = await prisma.store.findUnique({
      where: { code: storeCode },
    });

    if (existingStore) {
      return {
        success: false,
        error: '店舗コードが既に存在します。別の店舗名を試してください。',
      };
    }

    // パスワードのハッシュ化
    const hashedPassword = await hashPassword(password);

    // トランザクションで店舗とオーナーを作成
    const result = await prisma.$transaction(async (tx) => {
      // 店舗の作成
      const store = await tx.store.create({
        data: {
          name,
          code: storeCode,
          address,
          phone,
          adminEmail: ownerEmail,
        },
      });

      // オーナーユーザーの作成
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          name: ownerName,
          password: hashedPassword,
          role: 'OWNER',
          storeId: store.id,
        },
      });

      return { store, owner };
    });

    return {
      success: true,
      storeId: result.store.id,
      userId: result.owner.id,
    };
  } catch (error) {
    console.error('Store registration error:', error);
    return {
      success: false,
      error: '店舗登録中にエラーが発生しました。',
    };
  }
}

/**
 * 店舗名から店舗コードを生成する
 * 注: 実際のアプリでは、より堅牢なコード生成ロジックが必要
 */
function generateStoreCode(storeName: string): string {
  // 店舗名からシンプルなコードを生成（小文字化、空白除去、特殊文字除去）
  const baseCode = storeName
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w\s]/gi, '');
  
  // ランダムな数字を追加して一意性を高める
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  
  return `${baseCode}-${randomSuffix}`;
}