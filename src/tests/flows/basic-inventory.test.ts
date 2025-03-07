// @ts-nocheck
import { PrismaClient, Type } from '@prisma/client';

// Prismaクライアントのインスタンスを作成
const prisma = new PrismaClient();

describe('Basic Inventory Operations', () => {
  let storeId: string;

  beforeAll(async () => {
    // データベース接続を確認
    await prisma.$connect();
    console.log('Prisma connected to database');
  });

  afterAll(async () => {
    // 接続を閉じる
    await prisma.$disconnect();
    console.log('Prisma disconnected');
  });

  beforeEach(async () => {
    // テスト用のデータをクリア
    try {
      await prisma.store.deleteMany();
      console.log('Cleared store data');
    } catch (e) {
      console.error('Failed to clear data:', e);
    }

    // テスト用の店舗を作成
    try {
      const store = await prisma.store.create({
        data: {
          name: 'Test Nail Salon',
          code: 'TEST001',
          adminEmail: 'test@example.com',
        }
      });
      storeId = store.id;
      console.log(`Created test store with ID: ${storeId}`);
    } catch (e) {
      console.error('Failed to create test store:', e);
      throw e;
    }
  });

  test('should create a product', async () => {
    try {
      // 製品を作成
      const product = await prisma.product.create({
        data: {
          brand: 'OPI',
          productName: 'Red Nail Polish',
          colorCode: '#FF0000',
          colorName: 'Ruby Red',
          type: Type.POLISH_COLOR,
          price: 1200,
          capacity: 15,
          capacityUnit: 'ml',
          storeId
        }
      });

      // 検証
      expect(product).toBeDefined();
      expect(product.brand).toBe('OPI');
      expect(product.productName).toBe('Red Nail Polish');
      expect(product.storeId).toBe(storeId);
    } catch (e) {
      console.error('Test failed:', e);
      throw e;
    }
  });

  // 他の基本的なテストケースを追加
});