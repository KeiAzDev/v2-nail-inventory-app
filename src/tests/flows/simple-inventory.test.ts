// @ts-nocheck
import { PrismaClient, Type } from '@prisma/client';

// Prismaクライアントの直接インスタンス化
const prisma = new PrismaClient();

describe('Simple Inventory Test', () => {
  // 店舗ID
  let storeId;

  beforeAll(async () => {
    await prisma.$connect();
    console.log('Connected to database');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    console.log('Disconnected from database');
  });

  beforeEach(async () => {
    // データクリーンアップ - 直接Prismaクライアントを使用
    try {
      // 依存関係順にデータを削除
      console.log('Cleaning database...');
      await prisma.relatedProductUsage.deleteMany({});
      await prisma.usage.deleteMany({});
      await prisma.productLot.deleteMany({});
      await prisma.serviceTypeProduct.deleteMany({});
      await prisma.serviceType.deleteMany({});
      await prisma.product.deleteMany({});
      await prisma.activity.deleteMany({});
      await prisma.userSession.deleteMany({});
      await prisma.user.deleteMany({});
      await prisma.invitation.deleteMany({});
      await prisma.store.deleteMany({});
      console.log('Database cleaned');
    } catch (e) {
      console.error('Error cleaning database:', e);
    }

    // テスト用データを作成
    try {
      console.log('Creating test data...');
      // 店舗を直接作成
      const store = await prisma.store.create({
        data: {
          name: 'Test Nail Salon',
          code: 'TEST001',
          adminEmail: 'owner@test.com'
        }
      });
      storeId = store.id;
      console.log(`Store created with ID: ${storeId}`);
    } catch (e) {
      console.error('Error creating test data:', e);
      throw e;
    }
  });

  test('製品を作成できる', async () => {
    try {
      console.log('Testing product creation...');
      
      // 製品を直接作成
      const product = await prisma.product.create({
        data: {
          brand: 'OPI',
          productName: 'Red Nail Polish',
          colorCode: '#FF0000',
          colorName: 'Ruby Red',
          type: Type.POLISH_COLOR,
          opacity: 1.0,
          price: 1200,
          capacity: 15,
          capacityUnit: 'ml',
          storeId: storeId  // 明示的にstoreIdを指定
        }
      });
      
      console.log(`Product created: ${product.id}`);
      
      // 結果検証
      expect(product).toBeDefined();
      expect(product.brand).toBe('OPI');
      expect(product.productName).toBe('Red Nail Polish');
      expect(product.storeId).toBe(storeId);
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });
});