// @ts-nocheck
import { PrismaClient, Type } from '@prisma/client';

// Prismaクライアントの直接インスタンス化
const prisma = new PrismaClient();

describe('Extended Product Operations', () => {
  // テスト用の変数
  let storeId;
  let productIds = {};

  beforeAll(async () => {
    await prisma.$connect();
    console.log('Connected to database');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    console.log('Disconnected from database');
  });

  beforeEach(async () => {
    // データクリーンアップ
    try {
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
      console.log('Creating test store...');
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
      console.error('Error creating test store:', e);
      throw e;
    }
  });

  test('製品を作成して取得できる', async () => {
    try {
      // 製品を作成
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
          storeId
        }
      });
      
      console.log(`Product created: ${product.id}`);
      productIds.redPolish = product.id;
      
      // 結果検証
      expect(product).toBeDefined();
      expect(product.brand).toBe('OPI');
      expect(product.productName).toBe('Red Nail Polish');
      
      // 製品を取得して確認
      const retrievedProduct = await prisma.product.findUnique({
        where: { id: product.id }
      });
      
      expect(retrievedProduct).toBeDefined();
      expect(retrievedProduct.id).toBe(product.id);
      expect(retrievedProduct.productName).toBe('Red Nail Polish');
      
      // ロットも作成する
      const lot = await prisma.productLot.create({
        data: {
          productId: product.id,
          isInUse: false
        }
      });
      
      console.log(`Created product lot: ${lot.id}`);
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });

  test('製品情報を更新できる', async () => {
    try {
      // 製品を作成
      const product = await prisma.product.create({
        data: {
          brand: 'Essie',
          productName: 'Blue Polish',
          colorCode: '#0000FF',  // 必須フィールドを追加
          colorName: 'Ocean Blue',
          type: Type.POLISH_COLOR,
          opacity: 1.0,
          price: 1100,
          capacity: 15,
          capacityUnit: 'ml',
          storeId
        }
      });
      
      console.log(`Product created for update test: ${product.id}`);
      
      // 製品情報を更新
      const updatedProduct = await prisma.product.update({
        where: { id: product.id },
        data: {
          productName: 'Deep Blue Polish',
          price: 1200,
          colorName: 'Deep Ocean Blue'
        }
      });
      
      // 更新結果を検証
      expect(updatedProduct.productName).toBe('Deep Blue Polish');
      expect(updatedProduct.price).toBe(1200);
      expect(updatedProduct.colorName).toBe('Deep Ocean Blue');
      expect(updatedProduct.brand).toBe('Essie'); // 変更していない項目は維持される
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });

  test('複数の製品を検索できる', async () => {
    try {
      // 複数の製品を作成（colorCodeを全てに追加）
      const products = [
        {
          brand: 'OPI',
          productName: 'Red Nail Polish',
          colorCode: '#FF0000',
          colorName: 'Ruby Red',
          type: Type.POLISH_COLOR,
          price: 1200,
          storeId
        },
        {
          brand: 'Essie',
          productName: 'Blue Nail Polish',
          colorCode: '#0000FF',
          colorName: 'Ocean Blue',
          type: Type.POLISH_COLOR,
          price: 1100,
          storeId
        },
        {
          brand: 'OPI',
          productName: 'Base Coat',
          colorCode: '', // 空文字列でも可
          colorName: '',
          type: Type.POLISH_BASE,
          price: 1300,
          storeId
        },
        {
          brand: 'Seche Vite',
          productName: 'Top Coat',
          colorCode: '', // 空文字列でも可
          colorName: '',
          type: Type.POLISH_TOP,
          price: 1400,
          storeId
        }
      ];
      
      // 複数製品を一括作成
      for (const productData of products) {
        const product = await prisma.product.create({ data: productData });
        console.log(`Created product: ${product.id}`);
      }
      
      console.log(`Created ${products.length} products for search test`);
      
      // 全製品取得
      const allProducts = await prisma.product.findMany({
        where: { storeId }
      });
      
      expect(allProducts.length).toBe(products.length);
      
      // ブランドによるフィルタリング
      const opiProducts = await prisma.product.findMany({
        where: { 
          storeId,
          brand: 'OPI'
        }
      });
      
      expect(opiProducts.length).toBe(2);
      
      // タイプによるフィルタリング
      const colorPolishes = await prisma.product.findMany({
        where: {
          storeId,
          type: Type.POLISH_COLOR
        }
      });
      
      expect(colorPolishes.length).toBe(2);
      
      // 検索クエリによるフィルタリング（部分一致）
      const bluePolishes = await prisma.product.findMany({
        where: {
          storeId,
          productName: {
            contains: 'Blue',
            mode: 'insensitive'
          }
        }
      });
      
      expect(bluePolishes.length).toBe(1);
      expect(bluePolishes[0].colorName).toBe('Ocean Blue');
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });
});