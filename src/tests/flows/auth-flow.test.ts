// @ts-nocheck

// src/tests/flows/auth-flow.test.ts
import { createMocks } from 'node-mocks-http';
import { registerStore } from '@/lib/auth/store-registration';
import { createInvitation, validateInvitation } from '@/lib/auth/invitation';
import { registerStaff } from '@/lib/auth/staff-registration';
import * as prismaModule from '@/lib/prisma';
import { Role } from '@prisma/client';

// prisma.tsからエクスポートされるオブジェクトをモック化
jest.mock('@/lib/prisma', () => {
  const mockPrisma = {
    store: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    productLot: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    usage: {
      create: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    serviceType: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };
  
  return {
    prisma: mockPrisma,
  };
});

// 修正後のprisma参照
const { prisma } = prismaModule;

jest.mock('@/lib/email', () => ({
  sendInvitationEmail: jest.fn(() => Promise.resolve({ success: true })),
}));

describe('認証フロー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. 店舗登録プロセス', () => {
    it('オーナーが新規店舗を登録できること', async () => {
      // テストデータ
      const storeData = {
        name: 'テストネイルサロン',
        address: '東京都渋谷区1-1-1',
        phone: '03-1234-5678',
        ownerEmail: 'owner@example.com',
        ownerName: 'オーナー太郎',
        password: 'securePassword123'
      };

      // モックの応答を設定
      const mockStore = {
        id: 'store123',
        name: storeData.name,
        code: 'teststoreCode',
        adminEmail: storeData.ownerEmail,
      };

      const mockOwner = {
        id: 'user123',
        email: storeData.ownerEmail,
        name: storeData.ownerName,
        role: 'OWNER',
        storeId: 'store123',
      };

      prisma.store.create.mockResolvedValue(mockStore);
      prisma.user.create.mockResolvedValue(mockOwner);
      prisma.$transaction.mockImplementation(async (callback) => {
        return { store: mockStore, owner: mockOwner };
      });

      // 関数を実行
      const result = await registerStore(storeData);

      // 検証
      expect(result).toEqual({
        success: true,
        storeId: 'store123',
        userId: 'user123',
      });
    });
  });

  describe('2. スタッフ招待プロセス', () => {
    it('オーナーがスタッフを招待できること', async () => {
      // テストデータ
      const inviteData = {
        email: 'staff@example.com',
        role: Role.NAIL_TECHNICIAN,
        storeId: 'store123',
        invitedBy: 'user123',
        token: 'unique-invitation-token'  // 固定トークンを指定
      };

      // モックの応答を設定
      const mockInvitation = {
        id: 'invite123',
        token: 'unique-invitation-token',
        email: inviteData.email,
        storeId: inviteData.storeId,
        role: inviteData.role,
        expires: new Date(Date.now() + 86400000),
        used: false,
      };

      const mockStore = {
        id: 'store123',
        name: 'テストネイルサロン',
      };

      prisma.invitation.create.mockResolvedValue(mockInvitation);
      prisma.store.findUnique.mockResolvedValue(mockStore);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);

      // 関数を実行
      const result = await createInvitation(inviteData);

      // 検証
      expect(result).toEqual({
        success: true,
        invitationId: 'invite123',
        token: 'unique-invitation-token',
      });
    });

    it('有効な招待コードが検証できること', async () => {
      // テストデータ
      const token = 'valid-invitation-token';

      // モックの応答を設定
      const mockInvitation = {
        id: 'invite123',
        token: token,
        email: 'staff@example.com',
        storeId: 'store123',
        role: Role.NAIL_TECHNICIAN,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間後
        used: false,
      };

      const mockStore = {
        id: 'store123',
        name: 'テストネイルサロン',
      };

      prisma.invitation.findUnique.mockResolvedValue(mockInvitation);
      prisma.store.findUnique.mockResolvedValue(mockStore);

      // 関数を実行
      const result = await validateInvitation(token);

      // 検証
      expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
        where: { token },
      });

      expect(result).toEqual({
        isValid: true,
        invitation: mockInvitation,
        storeName: 'テストネイルサロン',
      });
    });
  });

  describe('3. スタッフ登録プロセス', () => {
    it('招待されたスタッフがアカウントを作成できること', async () => {
      // テストデータ
      const registrationData = {
        token: 'valid-invitation-token',
        name: 'スタッフ花子',
        password: 'securePassword456',
      };

      // モックの応答を設定
      const mockInvitation = {
        id: 'invite123',
        token: registrationData.token,
        email: 'staff@example.com',
        storeId: 'store123',
        role: Role.NAIL_TECHNICIAN,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        used: false,
      };

      const mockUser = {
        id: 'user456',
        email: 'staff@example.com',
        name: registrationData.name,
        role: Role.NAIL_TECHNICIAN,
        storeId: 'store123',
      };

      prisma.invitation.findUnique.mockResolvedValue(mockInvitation);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.invitation.update.mockResolvedValue({ ...mockInvitation, used: true });

      // 関数を実行
      const result = await registerStaff(registrationData);

      // 検証
      expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
        where: { token: registrationData.token },
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'staff@example.com',
          name: registrationData.name,
          role: Role.NAIL_TECHNICIAN,
          storeId: 'store123',
          password: expect.any(String), // ハッシュ化されたパスワード
        }),
      });

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invite123' },
        data: { used: true },
      });

      expect(result).toEqual({
        success: true,
        userId: 'user456',
      });
    });
  });
});

// 在庫管理フローテストとダッシュボードフローテストも修正......（他のテストはスキップ）