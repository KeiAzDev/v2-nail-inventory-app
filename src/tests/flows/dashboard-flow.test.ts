// @ts-nocheck
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrismaClient, Type, NailLength, Role } from '@prisma/client';
import { createStore } from '../../lib/auth/store-registration';
import { createStaffInvitation } from '../../lib/auth/invitation';
import { registerStaffFromInvitation } from '../../lib/auth/staff-registration';
import { createProduct, addProductStock, startUsingProduct, recordProductUsage } from '../../lib/inventory/product-service';
import { createServiceType } from '../../lib/inventory/service-type-service';
import {
  getDashboardSummary,
  getInventorySummary,
  getUsageStatistics,
  getFuturePredictions
} from '../../lib/dashboard/statistics-service';

describe('Dashboard Statistics Flow', () => {
  let mongod: MongoMemoryServer;
  let prisma: PrismaClient;
  let storeId: string;
  let ownerId: string;
  let technicianId: string;
  let serviceTypeId: string;
  let productIds: Record<string, string> = {};

  beforeAll(async () => {
    // テスト用DBのセットアップ
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.DATABASE_URL = uri;
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    // テスト後のクリーンアップ
    await prisma.$disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    // 各テスト前にDBをクリーンアップ
    await prisma.relatedProductUsage.deleteMany();
    await prisma.usage.deleteMany();
    await prisma.serviceTypeProduct.deleteMany();
    await prisma.serviceType.deleteMany();
    await prisma.productLot.deleteMany();
    await prisma.product.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.monthlyServiceStat.deleteMany();
    await prisma.user.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.store.deleteMany();

    // テスト用の店舗とオーナーを作成
    const storeData = {
      name: 'Test Nail Salon',
      address: 'Tokyo, Japan',
      phone: '03-1234-5678',
      email: 'owner@test.com',
      password: 'password123'
    };
    
    const store = await createStore(storeData);
    storeId = store.id;
    ownerId = store.ownerId;
    
    // テスト用のネイルテクニシャンを招待・登録
    const invitation = await createStaffInvitation({
      email: 'technician@test.com',
      role: Role.NAIL_TECHNICIAN,
      storeId: storeId,
      createdBy: ownerId
    });
    
    const technicianData = {
      invitationId: invitation.id,
      name: 'Test Technician',
      password: 'password123'
    };
    
    const technician = await registerStaffFromInvitation(technicianData);
    technicianId = technician.id;

    // テスト用の製品を複数作成（様々なタイプ）
    const products = [
      {
        brand: 'OPI',
        productName: 'Red Polish',
        colorCode: '#FF0000',
        colorName: 'Ruby Red',
        type: Type.POLISH_COLOR,
        price: 1200,
        capacity: 15,
        capacityUnit: 'ml',
        storeId
      },
      {
        brand: 'Essie',
        productName: 'Base Coat',
        type: Type.POLISH_BASE,
        price: 1100,
        capacity: 15,
        capacityUnit: 'ml',
        storeId
      },
      {
        brand: 'Seche Vite',
        productName: 'Top Coat',
        type: Type.POLISH_TOP,
        price: 1300,
        capacity: 15,
        capacityUnit: 'ml',
        storeId
      },
      {
        brand: 'Gelish',
        productName: 'Blue Gel',
        colorCode: '#0000FF',
        colorName: 'Ocean Blue',
        type: Type.GEL_COLOR,
        price: 1500,
        capacity: 10,
        capacityUnit: 'ml',
        storeId
      },
      {
        brand: 'Sally Hansen',
        productName: 'Cuticle Remover',
        type: Type.NAIL_CARE,
        price: 800,
        capacity: 30,
        capacityUnit: 'ml',
        storeId
      }
    ];

    // 製品を作成し、IDを保存
    for (const product of products) {
      const createdProduct = await createProduct(product);
      productIds[product.productName] = createdProduct.id;
      
      // ロットを使用開始状態にする
      const lots = await prisma.productLot.findMany({
        where: { productId: createdProduct.id }
      });
      await startUsingProduct(lots[0].id, ownerId);
    }

    // テスト用の施術タイプを作成
    const serviceType = await createServiceType({
      name: 'Basic Manicure',
      defaultUsageAmount: 0.5,
      productType: Type.POLISH_COLOR,
      storeId,
      products: [
        {
          productId: productIds['Base Coat'],
          usageAmount: 0.3,
          productRole: 'BASE',
          order: 1
        },
        {
          productId: productIds['Red Polish'],
          usageAmount: 0.5,
          productRole: 'COLOR',
          order: 2
        },
        {
          productId: productIds['Top Coat'],
          usageAmount: 0.4,
          productRole: 'TOP',
          order: 3
        }
      ]
    });
    serviceTypeId = serviceType.id;

    // 使用記録を登録
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    // 1. 2週間前の使用記録
    await prisma.usage.create({
      data: {
        date: twoWeeksAgo,
        usageAmount: 0.5,
        nailLength: NailLength.MEDIUM,
        serviceTypeId,
        productId: productIds['Red Polish'],
        isCustomAmount: false
      }
    });
    
    // 2. 1週間前の使用記録
    await prisma.usage.create({
      data: {
        date: oneWeekAgo,
        usageAmount: 0.6,
        nailLength: NailLength.LONG,
        serviceTypeId,
        productId: productIds['Red Polish'],
        isCustomAmount: false
      }
    });
    
    // 3. 今日の使用記録
    await prisma.usage.create({
      data: {
        date: now,
        usageAmount: 0.4,
        nailLength: NailLength.SHORT,
        serviceTypeId,
        productId: productIds['Red Polish'],
        isCustomAmount: false
      }
    });
    
    // 4. ジェルの使用記録
    await prisma.usage.create({
      data: {
        date: now,
        usageAmount: 0.7,
        nailLength: NailLength.MEDIUM,
        serviceTypeId,
        productId: productIds['Blue Gel'],
        isCustomAmount: false,
        isGelService: true
      }
    });
  });

  test('ダッシュボード概要情報を取得できること', async () => {
    const summary = await getDashboardSummary(storeId);
    
    expect(summary).toBeDefined();
    expect(summary.totalProducts).toBe(5);
    expect(summary.totalServiceTypes).toBe(1);
    expect(summary.totalUsageRecords).toBe(4);
    
    // アクティビティログが記録されていることを確認
    expect(summary.recentActivity.length).toBeGreaterThan(0);
  });

  test('在庫概要情報を取得できること', async () => {
    const summary = await getInventorySummary(storeId);
    
    expect(summary).toBeDefined();
    expect(summary.totalProducts).toBe(5);
    
    // カテゴリ別製品数を確認
    const polishColorCategory = summary.categoryBreakdown.find(c => c.category === Type.POLISH_COLOR);
    expect(polishColorCategory).toBeDefined();
    expect(polishColorCategory.count).toBe(1);
    
    // 最近使用された製品を確認
    expect(summary.recentlyUsed.length).toBeGreaterThan(0);
    expect(summary.recentlyUsed[0].productName).toBe('Red Polish'); // 最も最近使用されたのはRed Polish
  });

  test('使用統計情報を取得できること', async () => {
    const stats = await getUsageStatistics(storeId, 'month');
    
    expect(stats).toBeDefined();
    
    // 最も使用された製品を確認
    expect(stats.topUsedProducts.length).toBeGreaterThan(0);
    expect(stats.topUsedProducts[0].product.productName).toBe('Red Polish');
    expect(stats.topUsedProducts[0].usageCount).toBe(3); // 3回使用
    
    // 最も使用された施術タイプを確認
    expect(stats.topServiceTypes.length).toBe(1);
    expect(stats.topServiceTypes[0].serviceType.name).toBe('Basic Manicure');
    
    // 月別使用傾向を確認
    expect(stats.monthlyUsageTrend.length).toBeGreaterThan(0);
    
    // カテゴリ別使用状況を確認
    const polishColorUsage = stats.usageByCategory.find(c => c.category === Type.POLISH_COLOR);
    expect(polishColorUsage).toBeDefined();
    expect(polishColorUsage.count).toBe(3); // Red Polishの使用回数
  });

  test('将来予測情報を取得できること', async () => {
    const predictions = await getFuturePredictions(storeId);
    
    expect(predictions).toBeDefined();
    expect(predictions.expectedUsageByMonth.length).toBe(6); // 6ヶ月分の予測
    
    // 将来の使用予測があることを確認
    predictions.expectedUsageByMonth.forEach(month => {
      expect(month.month).toBeDefined();
      expect(month.predictedAmount).toBeDefined();
    });
  });
});