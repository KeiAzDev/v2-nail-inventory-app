// src/tests/flows/auth-flow.test.ts
import { createMocks } from 'node-mocks-http';
import { registerStore } from '@/lib/auth/store-registration';
import { createInvitation, validateInvitation } from '@/lib/auth/invitation';
import { registerStaff } from '@/lib/auth/staff-registration';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

// モックの設定
jest.mock('@/lib/prisma', () => ({
  prisma: {
    store: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

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
        code: expect.any(String),
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

      // 関数を実行
      const result = await registerStore(storeData);

      // 検証
      expect(prisma.store.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: storeData.name,
          address: storeData.address,
          phone: storeData.phone,
          adminEmail: storeData.ownerEmail,
        }),
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: storeData.ownerEmail,
          name: storeData.ownerName,
          role: 'OWNER',
          storeId: 'store123',
        }),
      });

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
      };

      // モックの応答を設定
      const mockInvitation = {
        id: 'invite123',
        token: 'unique-invitation-token',
        email: inviteData.email,
        storeId: inviteData.storeId,
        role: inviteData.role,
        expires: expect.any(Date),
        used: false,
      };

      const mockStore = {
        id: 'store123',
        name: 'テストネイルサロン',
      };

      prisma.invitation.create.mockResolvedValue(mockInvitation);
      prisma.store.findUnique.mockResolvedValue(mockStore);

      // 関数を実行
      const result = await createInvitation(inviteData);

      // 検証
      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: inviteData.email,
          role: inviteData.role,
          storeId: inviteData.storeId,
          token: expect.any(String),
          expires: expect.any(Date),
        }),
      });

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

// src/tests/flows/inventory-flow.test.ts
import { createProduct, updateProductStock, recordProductUsage } from '@/lib/inventory/product-service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    productLot: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    usage: {
      create: jest.fn(),
    },
  },
}));

describe('在庫管理フロー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. 製品登録プロセス', () => {
    it('新しい製品を登録できること', async () => {
      // テストデータ
      const productData = {
        brand: 'OPI',
        productName: 'Nail Lacquer',
        colorCode: '#FF0000',
        colorName: 'Red Hot',
        type: 'POLISH_COLOR',
        price: 1500,
        capacity: 15,
        capacityUnit: 'ml',
        storeId: 'store123',
      };

      // モックの応答を設定
      const mockProduct = {
        id: 'product123',
        ...productData,
        totalQuantity: 1,
        inUseQuantity: 0,
        lotQuantity: 1,
      };

      const mockProductLot = {
        id: 'lot123',
        productId: 'product123',
        isInUse: false,
      };

      prisma.product.create.mockResolvedValue(mockProduct);
      prisma.productLot.create.mockResolvedValue(mockProductLot);

      // 関数を実行
      const result = await createProduct(productData);

      // 検証
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining(productData),
      });

      expect(prisma.productLot.create).toHaveBeenCalledWith({
        data: {
          productId: 'product123',
          isInUse: false,
        },
      });

      expect(result).toEqual({
        success: true,
        productId: 'product123',
        lotId: 'lot123',
      });
    });
  });

  describe('2. 在庫更新プロセス', () => {
    it('製品の在庫を更新できること', async () => {
      // テストデータ
      const updateData = {
        productId: 'product123',
        addQuantity: 2,
      };

      // モックの応答を設定
      const mockProduct = {
        id: 'product123',
        totalQuantity: 1,
        lotQuantity: 1,
      };

      const mockUpdatedProduct = {
        id: 'product123',
        totalQuantity: 3,
        lotQuantity: 3,
      };

      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.product.update.mockResolvedValue(mockUpdatedProduct);

      // 関数を実行
      const result = await updateProductStock(updateData);

      // 検証
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product123' },
        data: {
          totalQuantity: 3,
          lotQuantity: 3,
        },
      });

      // 新しいロットが作成されたことを確認
      expect(prisma.productLot.create).toHaveBeenCalledTimes(2);

      expect(result).toEqual({
        success: true,
        product: mockUpdatedProduct,
      });
    });
  });

  describe('3. 製品使用記録プロセス', () => {
    it('製品の使用記録を登録できること', async () => {
      // テストデータ
      const usageData = {
        productId: 'product123',
        serviceTypeId: 'service123',
        usageAmount: 0.5,
        nailLength: 'MEDIUM',
        date: new Date(),
      };

      // モックの応答を設定
      const mockProduct = {
        id: 'product123',
        inUseQuantity: 1,
      };

      const mockProductLot = {
        id: 'lot123',
        productId: 'product123',
        isInUse: true,
        currentAmount: 10,
      };

      const mockUsage = {
        id: 'usage123',
        productId: 'product123',
        serviceTypeId: 'service123',
        usageAmount: 0.5,
        usedLotId: 'lot123',
      };

      prisma.product.findUnique.mockResolvedValue(mockProduct);
      prisma.productLot.findMany.mockResolvedValue([mockProductLot]);
      prisma.productLot.update.mockResolvedValue({
        ...mockProductLot,
        currentAmount: 9.5,
      });
      prisma.usage.create.mockResolvedValue(mockUsage);

      // 関数を実行
      const result = await recordProductUsage(usageData);

      // 検証
      expect(prisma.productLot.update).toHaveBeenCalledWith({
        where: { id: 'lot123' },
        data: {
          currentAmount: 9.5,
        },
      });

      expect(prisma.usage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'product123',
          serviceTypeId: 'service123',
          usageAmount: 0.5,
          usedLotId: 'lot123',
        }),
      });

      expect(result).toEqual({
        success: true,
        usageId: 'usage123',
      });
    });
  });
});

// src/tests/flows/dashboard-flow.test.ts
import { getStoreInventorySummary, getProductUsageStatistics } from '@/lib/dashboard/statistics-service';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
    },
    usage: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    serviceType: {
      findMany: jest.fn(),
    },
  },
}));

describe('ダッシュボードフロー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. 在庫サマリー取得', () => {
    it('店舗の在庫サマリーを取得できること', async () => {
      // テストデータ
      const storeId = 'store123';

      // モックの応答を設定
      const mockProducts = [
        {
          id: 'product1',
          brand: 'OPI',
          productName: 'Nail Lacquer Red',
          type: 'POLISH_COLOR',
          totalQuantity: 3,
          inUseQuantity: 1,
          lotQuantity: 2,
          currentProductLots: [
            { id: 'lot1', isInUse: true, currentAmount: 8.5 },
            { id: 'lot2', isInUse: false },
            { id: 'lot3', isInUse: false },
          ],
        },
        {
          id: 'product2',
          brand: 'Essie',
          productName: 'Gel Couture',
          type: 'GEL_COLOR',
          totalQuantity: 2,
          inUseQuantity: 1,
          lotQuantity: 1,
          currentProductLots: [
            { id: 'lot4', isInUse: true, currentAmount: 12.0 },
            { id: 'lot5', isInUse: false },
          ],
        },
      ];

      prisma.product.findMany.mockResolvedValue(mockProducts);

      // 関数を実行
      const result = await getStoreInventorySummary(storeId);

      // 検証
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { storeId },
        include: { currentProductLots: true },
      });

      expect(result).toEqual({
        totalProducts: 2,
        lowStockProducts: expect.any(Array),
        byCategoryCount: expect.any(Object),
        recentlyUsedProducts: expect.any(Array),
      });
    });
  });

  describe('2. 使用統計取得', () => {
    it('製品の使用統計を取得できること', async () => {
      // テストデータ
      const params = {
        storeId: 'store123',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-31'),
      };

      // モックの応答を設定
      const mockUsageStats = [
        {
          productId: 'product1',
          _sum: { usageAmount: 10.5 },
          _count: { id: 20 },
        },
        {
          productId: 'product2',
          _sum: { usageAmount: 5.2 },
          _count: { id: 8 },
        },
      ];

      const mockProducts = [
        { id: 'product1', productName: 'Nail Lacquer Red', brand: 'OPI' },
        { id: 'product2', productName: 'Gel Couture', brand: 'Essie' },
      ];

      const mockUsages = [
        { id: 'usage1', productId: 'product1', date: new Date('2023-01-15') },
        { id: 'usage2', productId: 'product1', date: new Date('2023-01-20') },
        { id: 'usage3', productId: 'product2', date: new Date('2023-01-10') },
      ];

      prisma.usage.groupBy.mockResolvedValue(mockUsageStats);
      prisma.product.findMany.mockResolvedValue(mockProducts);
      prisma.usage.findMany.mockResolvedValue(mockUsages);

      // 関数を実行
      const result = await getProductUsageStatistics(params);

      // 検証
      expect(prisma.usage.groupBy).toHaveBeenCalledWith({
        where: {
          date: {
            gte: params.startDate,
            lte: params.endDate,
          },
          product: {
            storeId: params.storeId,
          },
        },
        by: ['productId'],
        _sum: {
          usageAmount: true,
        },
        _count: {
          id: true,
        },
      });

      expect(result).toEqual({
        totalUsage: 15.7, // 10.5 + 5.2
        usageByProduct: expect.any(Array),
        usageTimeline: expect.any(Array),
      });
    });
  });
});