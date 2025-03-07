// @ts-nocheck
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrismaClient, Type, NailLength, Role } from '@prisma/client';
import { createStore } from '../../lib/auth/store-registration';
import { createStaffInvitation } from '../../lib/auth/invitation';
import { registerStaffFromInvitation } from '../../lib/auth/staff-registration';
import { createProduct } from '../../lib/inventory/product-service';

describe('Inventory Management Flow', () => {
  let mongod;
  let prisma;
  let storeId;
  let ownerId;

  beforeAll(async () => {
    // テスト用DBのセットアップ
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    console.log('MongoDB URI:', uri);
    
    // 環境変数をセット
    process.env.DATABASE_URL = uri;
    
    // Prismaクライアントを作成し接続
    prisma = new PrismaClient();
    await prisma.$connect();
    console.log('Connected to database');
  });

  afterAll(async () => {
    // テスト後のクリーンアップ
    await prisma.$disconnect();
    await mongod.stop();
    console.log('Disconnected and stopped MongoDB');
  });

  beforeEach(async () => {
    console.log('Cleaning up database...');
    
    // データクリーンアップ - 順序に注意
    const deleteCollections = async () => {
      const collections = [
        'Usage',
        'RelatedProductUsage',
        'ProductLot',
        'ServiceTypeProduct',
        'ServiceType',
        'Product',
        'Activity',
        'UserSession',
        'User',
        'Invitation',
        'Store'
      ];
      
      for (const collection of collections) {
        try {
          // delete関数をダイナミックに呼び出し
          await prisma[collection.charAt(0).toLowerCase() + collection.slice(1)].deleteMany({});
          console.log(`Deleted all records from ${collection}`);
        } catch (e) {
          console.log(`Error deleting from ${collection}: ${e.message}`);
        }
      }
    };
    
    await deleteCollections();
    
    // 基本データセットアップ
    console.log('Setting up test data...');
    try {
      // テスト用店舗を作成
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
      console.log(`Created store: ${storeId}`);
    } catch (error) {
      console.error('Error in test setup:', error);
    }
  });

  test('オーナーが製品を登録できること', async () => {
    console.log('Testing product registration...');
    
    // 製品データを準備
    const productData = {
      brand: 'OPI',
      productName: 'Red Nail Polish',
      colorCode: '#FF0000',
      colorName: 'Ruby Red',
      type: Type.POLISH_COLOR,
      price: 1200,
      capacity: 15,
      capacityUnit: 'ml',
      storeId
    };
    
    // 製品を作成
    const product = await createProduct(productData);
    console.log(`Created product: ${product.id}`);
    
    // 検証
    expect(product).toBeDefined();
    expect(product.brand).toBe('OPI');
    expect(product.productName).toBe('Red Nail Polish');
  });
});