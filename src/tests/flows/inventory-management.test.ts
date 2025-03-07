// @ts-nocheck
import { PrismaClient, Type, NailLength } from '@prisma/client';

// Prismaクライアントの直接インスタンス化
const prisma = new PrismaClient();

describe('Inventory Management Operations', () => {
  // テスト用の変数
  let storeId;
  let productId;
  let serviceTypeId;
  let userId;
  let lotId;

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
      console.log('Creating test data...');
      
      // 店舗を作成
      const store = await prisma.store.create({
        data: {
          name: 'Test Nail Salon',
          code: 'TEST001',
          adminEmail: 'owner@test.com'
        }
      });
      storeId = store.id;
      console.log(`Store created with ID: ${storeId}`);
      
      // ユーザーを作成（オーナー）
      const user = await prisma.user.create({
        data: {
          email: 'owner@test.com',
          password: 'hashed_password',
          name: 'Test Owner',
          role: 'OWNER',
          storeId
        }
      });
      userId = user.id;
      console.log(`User created with ID: ${userId}`);
      
      // 製品を作成
      const product = await prisma.product.create({
        data: {
          brand: 'OPI',
          productName: 'Red Nail Polish',
          colorCode: '#FF0000', // colorCodeは必須
          colorName: 'Ruby Red',
          type: Type.POLISH_COLOR,
          opacity: 1.0,
          price: 1200,
          capacity: 15,
          capacityUnit: 'ml',
          storeId
        }
      });
      productId = product.id;
      console.log(`Product created with ID: ${productId}`);
      
      // ロットを作成（製品作成時に自動的には作成されない）
      const lot = await prisma.productLot.create({
        data: {
          productId,
          isInUse: false
        }
      });
      lotId = lot.id;
      console.log(`Product lot created with ID: ${lotId}`);
      
      // 製品の在庫状態を更新
      await prisma.product.update({
        where: { id: productId },
        data: {
          totalQuantity: 1,
          lotQuantity: 1,
          inUseQuantity: 0
        }
      });
      
      // サービスタイプを作成
      const serviceType = await prisma.serviceType.create({
        data: {
          name: 'Basic Manicure',
          defaultUsageAmount: 0.5,
          productType: Type.POLISH_COLOR,
          storeId
        }
      });
      serviceTypeId = serviceType.id;
      console.log(`Service type created with ID: ${serviceTypeId}`);
    } catch (e) {
      console.error('Error creating test data:', e);
      throw e;
    }
  });

  test('製品ロットを作成して使用状態を管理できる', async () => {
    try {
      // 初期ロットの確認
      const initialLots = await prisma.productLot.findMany({
        where: { productId }
      });
      
      expect(initialLots.length).toBe(1);
      expect(initialLots[0].isInUse).toBe(false);
      
      // 追加のロットを作成
      const newLot = await prisma.productLot.create({
        data: {
          productId,
          isInUse: false
        }
      });
      
      console.log(`Created additional lot: ${newLot.id}`);
      
      // 製品の在庫数を更新
      await prisma.product.update({
        where: { id: productId },
        data: {
          totalQuantity: { increment: 1 },
          lotQuantity: { increment: 1 }
        }
      });
      
      // ロットを使用開始状態に変更
      const updatedLot = await prisma.productLot.update({
        where: { id: newLot.id },
        data: {
          isInUse: true,
          currentAmount: 15, // 15 ml（容量いっぱい）
          startedAt: new Date()
        }
      });
      
      // 製品の在庫状態を更新
      await prisma.product.update({
        where: { id: productId },
        data: {
          lotQuantity: { decrement: 1 },
          inUseQuantity: { increment: 1 }
        }
      });
      
      // 検証
      expect(updatedLot.isInUse).toBe(true);
      expect(updatedLot.currentAmount).toBe(15);
      expect(updatedLot.startedAt).toBeDefined();
      
      // 製品の状態を確認
      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId }
      });
      
      expect(updatedProduct.totalQuantity).toBe(2); // 合計2本
      expect(updatedProduct.lotQuantity).toBe(1); // 未使用1本
      expect(updatedProduct.inUseQuantity).toBe(1); // 使用中1本
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });

  test('製品使用記録を登録できる', async () => {
    try {
      // 使用するロットを使用開始状態に変更
      await prisma.productLot.update({
        where: { id: lotId },
        data: {
          isInUse: true,
          currentAmount: 15, // 15 ml（容量いっぱい）
          startedAt: new Date()
        }
      });
      
      // 製品の在庫状態を更新
      await prisma.product.update({
        where: { id: productId },
        data: {
          lotQuantity: { decrement: 1 },
          inUseQuantity: { increment: 1 }
        }
      });
      
      console.log(`Lot ${lotId} marked as in use`);
      
      // 使用記録を作成
      const usage = await prisma.usage.create({
        data: {
          date: new Date(),
          usageAmount: 0.5, // 0.5 ml使用
          nailLength: NailLength.MEDIUM,
          serviceTypeId,
          productId,
          usedLotId: lotId
        }
      });
      
      console.log(`Created usage record: ${usage.id}`);
      
      // ロットの残量を更新
      await prisma.productLot.update({
        where: { id: lotId },
        data: {
          currentAmount: { decrement: 0.5 } // 使用量を減算
        }
      });
      
      // 製品の使用統計を更新
      await prisma.product.update({
        where: { id: productId },
        data: {
          usageCount: { increment: 1 },
          lastUsed: new Date()
        }
      });
      
      // 検証
      const updatedLot = await prisma.productLot.findUnique({
        where: { id: lotId }
      });
      
      expect(updatedLot.currentAmount).toBe(14.5); // 15 - 0.5 = 14.5 ml
      
      const usageRecord = await prisma.usage.findUnique({
        where: { id: usage.id }
      });
      
      expect(usageRecord).toBeDefined();
      expect(usageRecord.usageAmount).toBe(0.5);
      expect(usageRecord.nailLength).toBe(NailLength.MEDIUM);
      
      // 製品の使用統計の検証
      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId }
      });
      
      expect(updatedProduct.usageCount).toBe(1);
      expect(updatedProduct.lastUsed).toBeDefined();
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });

  test('関連製品の使用記録を登録できる', async () => {
    try {
      // ベース、トップコートの製品を追加
      const baseCoat = await prisma.product.create({
        data: {
          brand: 'OPI',
          productName: 'Base Coat',
          colorCode: '', // 空文字でも可
          colorName: '',
          type: Type.POLISH_BASE,
          price: 1300,
          capacity: 15,
          capacityUnit: 'ml',
          storeId
        }
      });
      
      const topCoat = await prisma.product.create({
        data: {
          brand: 'OPI',
          productName: 'Top Coat',
          colorCode: '', // 空文字でも可
          colorName: '',
          type: Type.POLISH_TOP,
          price: 1300,
          capacity: 15,
          capacityUnit: 'ml',
          storeId
        }
      });
      
      console.log(`Created base coat: ${baseCoat.id}, top coat: ${topCoat.id}`);
      
      // 各製品のロットを作成
      const baseLot = await prisma.productLot.create({ 
        data: { 
          productId: baseCoat.id, 
          isInUse: true, 
          currentAmount: 15 
        } 
      });
      
      const topLot = await prisma.productLot.create({ 
        data: { 
          productId: topCoat.id, 
          isInUse: true, 
          currentAmount: 15 
        } 
      });
      
      // 既存のロットを使用状態に
      await prisma.productLot.update({
        where: { id: lotId },
        data: {
          isInUse: true,
          currentAmount: 15,
          startedAt: new Date()
        }
      });
      
      // メイン使用記録を作成
      const usage = await prisma.usage.create({
        data: {
          date: new Date(),
          usageAmount: 0.7, // 0.7 ml使用
          nailLength: NailLength.LONG,
          serviceTypeId,
          productId,
          usedLotId: lotId
        }
      });
      
      console.log(`Created main usage record: ${usage.id}`);
      
      // 関連使用記録を作成
      const relatedUsage1 = await prisma.relatedProductUsage.create({
        data: {
          usageId: usage.id,
          productId: baseCoat.id,
          amount: 0.5,
          role: 'BASE',
          order: 1,
          usedLotId: baseLot.id
        }
      });
      
      const relatedUsage2 = await prisma.relatedProductUsage.create({
        data: {
          usageId: usage.id,
          productId: topCoat.id,
          amount: 0.6,
          role: 'TOP',
          order: 3,
          usedLotId: topLot.id
        }
      });
      
      console.log(`Created related usage records: ${relatedUsage1.id}, ${relatedUsage2.id}`);
      
      // 各ロットの残量を更新
      await prisma.productLot.update({
        where: { id: lotId },
        data: { currentAmount: { decrement: 0.7 } }
      });
      
      await prisma.productLot.update({
        where: { id: baseLot.id },
        data: { currentAmount: { decrement: 0.5 } }
      });
      
      await prisma.productLot.update({
        where: { id: topLot.id },
        data: { currentAmount: { decrement: 0.6 } }
      });
      
      // 検証
      const relatedUsages = await prisma.relatedProductUsage.findMany({
        where: { usageId: usage.id }
      });
      
      expect(relatedUsages.length).toBe(2);
      
      // 各ロットの残量を確認
      const updatedMainLot = await prisma.productLot.findUnique({
        where: { id: lotId }
      });
      
      const updatedBaseLot = await prisma.productLot.findUnique({
        where: { id: baseLot.id }
      });
      
      const updatedTopLot = await prisma.productLot.findUnique({
        where: { id: topLot.id }
      });
      
      expect(updatedMainLot.currentAmount).toBe(14.3); // 15 - 0.7 = 14.3
      expect(updatedBaseLot.currentAmount).toBe(14.5); // 15 - 0.5 = 14.5
      expect(updatedTopLot.currentAmount).toBe(14.4); // 15 - 0.6 = 14.4
    } catch (e) {
      console.error('Test error:', e);
      throw e;
    }
  });
});