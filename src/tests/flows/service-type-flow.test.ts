// @ts-nocheck
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrismaClient, Type, NailLength, Role } from '@prisma/client';
import { createStore } from '../../lib/auth/store-registration';
import { createStaffInvitation } from '../../lib/auth/invitation';
import { registerStaffFromInvitation } from '../../lib/auth/staff-registration';
import { createProduct } from '../../lib/inventory/product-service';
import {
  createServiceType,
  updateServiceType,
  upsertServiceTypeProduct,
  removeProductFromServiceType,
  copyServiceType,
  getServiceTypeWithProducts,
  getServiceTypes,
  calculateAdjustedUsageAmount,
  updateMonthlyStats
} from '../../lib/inventory/service-type-service';

describe('Service Type Management Flow', () => {
  let mongod: MongoMemoryServer;
  let prisma: PrismaClient;
  let storeId: string;
  let ownerId: string;
  let serviceTypeId: string;
  let baseCoatId: string;
  let colorPolishId: string;
  let topCoatId: string;

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
    
    // テスト用の製品を作成（ベース、カラー、トップコート）
    const baseCoat = await createProduct({
      brand: 'OPI',
      productName: 'Base Coat',
      type: Type.POLISH_BASE,
      price: 1200,
      capacity: 15,
      capacityUnit: 'ml',
      storeId
    });
    baseCoatId = baseCoat.id;
    
    const colorPolish = await createProduct({
      brand: 'OPI',
      productName: 'Red Polish',
      colorCode: '#FF0000',
      colorName: 'Ruby Red',
      type: Type.POLISH_COLOR,
      price: 1300,
      capacity: 15,
      capacityUnit: 'ml',
      storeId
    });
    colorPolishId = colorPolish.id;
    
    const topCoat = await createProduct({
      brand: 'OPI',
      productName: 'Top Coat',
      type: Type.POLISH_TOP,
      price: 1100,
      capacity: 15,
      capacityUnit: 'ml',
      storeId
    });
    topCoatId = topCoat.id;
  });

  test('施術タイプを作成できること', async () => {
    const serviceTypeData = {
      name: 'Basic Manicure',
      defaultUsageAmount: 0.5,
      productType: Type.POLISH_COLOR,
      isGelService: false,
      storeId,
      products: [
        {
          productId: baseCoatId,
          usageAmount: 0.3,
          productRole: 'BASE',
          order: 1
        },
        {
          productId: colorPolishId,
          usageAmount: 0.5,
          productRole: 'COLOR',
          order: 2
        },
        {
          productId: topCoatId,
          usageAmount: 0.4,
          productRole: 'TOP',
          order: 3
        }
      ]
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    serviceTypeId = serviceType.id;
    
    expect(serviceType).toBeDefined();
    expect(serviceType.name).toBe('Basic Manicure');
    expect(serviceType.defaultUsageAmount).toBe(0.5);
    
    // 関連製品が正しく登録されていることを確認
    const serviceTypeWithProducts = await getServiceTypeWithProducts(serviceType.id);
    expect(serviceTypeWithProducts.serviceTypeProducts.length).toBe(3);
    
    // 順序が正しいことを確認
    const products = serviceTypeWithProducts.serviceTypeProducts;
    expect(products[0].productId).toBe(baseCoatId);
    expect(products[1].productId).toBe(colorPolishId);
    expect(products[2].productId).toBe(topCoatId);
  });

  test('施術タイプを更新できること', async () => {
          // 先に施術タイプを作成
    const serviceTypeData = {
      name: 'French Manicure',
      defaultUsageAmount: 0.4,
      productType: Type.POLISH_COLOR,
      storeId
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    serviceTypeId = serviceType.id;
    
    // 施術タイプを更新
    const updatedData = {
      id: serviceTypeId,
      name: 'Premium French Manicure',
      defaultUsageAmount: 0.5,
      allowCustomAmount: true
    };
    
    const updatedServiceType = await updateServiceType(updatedData);
    
    expect(updatedServiceType.name).toBe('Premium French Manicure');
    expect(updatedServiceType.defaultUsageAmount).toBe(0.5);
    expect(updatedServiceType.allowCustomAmount).toBe(true);
  });

  test('施術タイプに製品を追加/更新できること', async () => {
    // 先に施術タイプを作成（製品なし）
    const serviceTypeData = {
      name: 'Simple Manicure',
      defaultUsageAmount: 0.5,
      productType: Type.POLISH_COLOR,
      storeId
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    serviceTypeId = serviceType.id;
    
    // ベースコートを追加
    await upsertServiceTypeProduct({
      serviceTypeId,
      productId: baseCoatId,
      usageAmount: 0.3,
      productRole: 'BASE',
      order: 1
    });
    
    // カラーポリッシュを追加
    await upsertServiceTypeProduct({
      serviceTypeId,
      productId: colorPolishId,
      usageAmount: 0.5,
      productRole: 'COLOR',
      order: 2
    });
    
    // 関連製品が正しく登録されていることを確認
    let serviceTypeWithProducts = await getServiceTypeWithProducts(serviceTypeId);
    expect(serviceTypeWithProducts.serviceTypeProducts.length).toBe(2);
    
    // カラーポリッシュの使用量を更新
    await upsertServiceTypeProduct({
      serviceTypeId,
      productId: colorPolishId,
      usageAmount: 0.7, // 増量
      productRole: 'COLOR',
      order: 2
    });
    
    // 更新されていることを確認
    serviceTypeWithProducts = await getServiceTypeWithProducts(serviceTypeId);
    const colorProduct = serviceTypeWithProducts.serviceTypeProducts.find(p => p.productId === colorPolishId);
    expect(colorProduct.usageAmount).toBe(0.7);
  });

  test('施術タイプから製品を削除できること', async () => {
    // 先に施術タイプを作成（製品あり）
    const serviceTypeData = {
      name: 'Complete Manicure',
      defaultUsageAmount: 0.5,
      productType: Type.POLISH_COLOR,
      storeId,
      products: [
        { productId: baseCoatId, usageAmount: 0.3, order: 1 },
        { productId: colorPolishId, usageAmount: 0.5, order: 2 },
        { productId: topCoatId, usageAmount: 0.4, order: 3 }
      ]
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    serviceTypeId = serviceType.id;
    
    // 最初は3つの製品があることを確認
    let serviceTypeWithProducts = await getServiceTypeWithProducts(serviceTypeId);
    expect(serviceTypeWithProducts.serviceTypeProducts.length).toBe(3);
    
    // ベースコートを削除
    await removeProductFromServiceType(serviceTypeId, baseCoatId);
    
    // 削除後は2つになることを確認
    serviceTypeWithProducts = await getServiceTypeWithProducts(serviceTypeId);
    expect(serviceTypeWithProducts.serviceTypeProducts.length).toBe(2);
    
    // ベースコートが削除されていることを確認
    const hasBaseCoat = serviceTypeWithProducts.serviceTypeProducts.some(p => p.productId === baseCoatId);
    expect(hasBaseCoat).toBe(false);
  });

  test('施術タイプをコピーできること', async () => {
    // 先に施術タイプを作成（製品あり）
    const serviceTypeData = {
      name: 'Regular Manicure',
      defaultUsageAmount: 0.5,
      productType: Type.POLISH_COLOR,
      storeId,
      products: [
        { productId: baseCoatId, usageAmount: 0.3, order: 1 },
        { productId: colorPolishId, usageAmount: 0.5, order: 2 },
        { productId: topCoatId, usageAmount: 0.4, order: 3 }
      ]
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    
    // フレンチバリエーションとしてコピー
    const copyParams = {
      sourceId: serviceType.id,
      newName: 'French Manicure',
      designVariant: 'FRENCH',
      designUsageRate: 1.2 // 20%増量
    };
    
    const copiedServiceType = await copyServiceType(copyParams);
    
    expect(copiedServiceType.name).toBe('French Manicure');
    expect(copiedServiceType.designVariant).toBe('FRENCH');
    expect(copiedServiceType.designUsageRate).toBe(1.2);
    
    // 関連製品がコピーされていることを確認
    const copiedWithProducts = await getServiceTypeWithProducts(copiedServiceType.id);
    expect(copiedWithProducts.serviceTypeProducts.length).toBe(3);
  });

  test('爪の長さに応じた使用量調整が機能すること', async () => {
    // 先に施術タイプを作成
    const serviceTypeData = {
      name: 'Adjustable Manicure',
      defaultUsageAmount: 0.5,
      productType: Type.POLISH_COLOR, // 必須フィールドを追加
      shortLengthRate: 80,  // 80%
      mediumLengthRate: 100, // 100%
      longLengthRate: 150,  // 150%
      storeId
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    
    // 各爪の長さでの使用量を計算
    const shortAmount = calculateAdjustedUsageAmount(serviceType, 0.5, NailLength.SHORT);
    const mediumAmount = calculateAdjustedUsageAmount(serviceType, 0.5, NailLength.MEDIUM);
    const longAmount = calculateAdjustedUsageAmount(serviceType, 0.5, NailLength.LONG);
    
    // 期待値との比較
    expect(shortAmount).toBe(0.4);  // 0.5 * 0.8 = 0.4
    expect(mediumAmount).toBe(0.5); // 0.5 * 1.0 = 0.5
    expect(longAmount).toBe(0.75);  // 0.5 * 1.5 = 0.75
  });

  test('月間統計が正しく更新されること', async () => {
    // 先に施術タイプを作成
    const serviceTypeData = {
      name: 'Statistical Manicure',
      defaultUsageAmount: 0.5,
      storeId
    };
    
    const serviceType = await createServiceType(serviceTypeData);
    
    // 現在の年月を取得
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // 使用記録を追加（0.6ml）
    await updateMonthlyStats(serviceType.id, 0.6, now);
    
    // 統計を確認
    let stats = await prisma.monthlyServiceStat.findUnique({
      where: {
        monthlyStatIdentifier: {
          serviceTypeId: serviceType.id,
          year,
          month
        }
      }
    });
    
    expect(stats).toBeDefined();
    expect(stats.totalUsage).toBe(0.6);
    expect(stats.usageCount).toBe(1);
    expect(stats.averageUsage).toBe(0.6);
    
    // さらに使用記録を追加（0.4ml）
    await updateMonthlyStats(serviceType.id, 0.4, now);
    
    // 更新された統計を確認
    stats = await prisma.monthlyServiceStat.findUnique({
      where: {
        monthlyStatIdentifier: {
          serviceTypeId: serviceType.id,
          year,
          month
        }
      }
    });
    
    expect(stats.totalUsage).toBe(1.0); // 0.6 + 0.4
    expect(stats.usageCount).toBe(2);
    expect(stats.averageUsage).toBe(0.5); // (0.6 + 0.4) / 2
  });

  test('店舗の施術タイプ一覧を取得できること', async () => {
    // 複数の施術タイプを作成
    await createServiceType({
      name: 'Basic Manicure',
      productType: Type.POLISH_COLOR,
      storeId
    });
    
    await createServiceType({
      name: 'Gel Manicure',
      productType: Type.GEL_COLOR,
      isGelService: true,
      storeId
    });
    
    await createServiceType({
      name: 'French Manicure',
      productType: Type.POLISH_COLOR,
      designVariant: 'FRENCH',
      storeId
    });
    
    // 施術タイプ一覧を取得
    const serviceTypes = await getServiceTypes(storeId);
    
    expect(serviceTypes.length).toBe(3);
    
    // アルファベット順に並んでいることを確認
    expect(serviceTypes[0].name).toBe('Basic Manicure');
    expect(serviceTypes[1].name).toBe('French Manicure');
    expect(serviceTypes[2].name).toBe('Gel Manicure');
  });
});