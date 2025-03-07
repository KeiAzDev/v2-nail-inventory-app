import { PrismaClient, Type, NailLength, Product, ProductLot, Usage } from '@prisma/client';
import {prisma} from '../prisma';

// 製品登録用のインターフェース
interface CreateProductParams {
  brand: string;
  productName: string;
  colorCode?: string;
  colorName?: string;
  opacity?: number;
  type: Type;
  price: number;
  isLiquid?: boolean;
  useColorPicker?: boolean;
  capacity?: number;
  capacityUnit?: string;
  averageUsePerService?: number;
  totalQuantity?: number;
  recommendedAlertPercentage?: number;
  minStockAlert?: number;
  storeId: string;
}

// 製品更新用のインターフェース
interface UpdateProductParams {
  id: string;
  brand?: string;
  productName?: string;
  colorCode?: string;
  colorName?: string;
  opacity?: number;
  type?: Type;
  price?: number;
  isLiquid?: boolean;
  useColorPicker?: boolean;
  capacity?: number;
  capacityUnit?: string;
  averageUsePerService?: number;
  totalQuantity?: number;
  recommendedAlertPercentage?: number;
  minStockAlert?: number;
}

// 製品検索用のインターフェース
interface GetProductsParams {
  storeId: string;
  type?: Type;
  brand?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 在庫追加用のインターフェース
interface AddProductStockParams {
  productId: string;
  quantity: number;
  currentAmount?: number;
  isInUse?: boolean;
  addedBy: string;
}

// 製品使用記録用のインターフェース
interface RecordProductUsageParams {
  productId: string;
  serviceTypeId: string;
  usageAmount: number;
  defaultAmount?: number;
  nailLength: NailLength;
  isCustomAmount?: boolean;
  relatedProducts?: Array<{
    productId: string;
    amount: number;
    defaultAmount?: number;
    isCustomAmount?: boolean;
    role?: string;
    order?: number;
  }>;
  note?: string;
  recordedBy: string;
}

/**
 * 新しい製品を登録する
 */
export async function createProduct(params: CreateProductParams): Promise<Product> {
  const {
    brand,
    productName,
    colorCode = '',
    colorName = '',
    opacity = 1,
    type,
    price,
    isLiquid = true,
    useColorPicker = true,
    capacity,
    capacityUnit,
    averageUsePerService,
    totalQuantity = 1,
    recommendedAlertPercentage = 20,
    minStockAlert = 5,
    storeId
  } = params;

  // 店舗の存在確認
  const store = await prisma.store.findUnique({
    where: { id: storeId }
  });

  if (!store) {
    throw new Error(`Store with ID ${storeId} not found`);
  }

  // 製品の作成
  const product = await prisma.product.create({
    data: {
      brand,
      productName,
      colorCode,
      colorName,
      opacity,
      type,
      price,
      isLiquid,
      useColorPicker,
      capacity,
      capacityUnit,
      averageUsePerService,
      totalQuantity,
      lotQuantity: totalQuantity, // 初期状態では未使用ロット = 総数
      recommendedAlertPercentage,
      minStockAlert,
      storeId
    }
  });

  // 製品ロットを作成（最初は未使用状態で）
  for (let i = 0; i < totalQuantity; i++) {
    await prisma.productLot.create({
      data: {
        productId: product.id,
        isInUse: false
      }
    });
  }

  return product;
}

/**
 * 製品情報を更新する
 */
export async function updateProduct(params: UpdateProductParams): Promise<Product> {
  const { id, ...updateData } = params;

  // 製品の存在確認
  const existingProduct = await prisma.product.findUnique({
    where: { id }
  });

  if (!existingProduct) {
    throw new Error(`Product with ID ${id} not found`);
  }

  // 製品の更新
  const updatedProduct = await prisma.product.update({
    where: { id },
    data: updateData
  });

  return updatedProduct;
}

/**
 * 製品IDから製品情報を取得する
 */
export async function getProductById(id: string): Promise<Product | null> {
  return prisma.product.findUnique({
    where: { id },
    include: {
      currentProductLots: true
    }
  });
}

/**
 * 製品一覧を取得する
 */
export async function getProducts(params: GetProductsParams): Promise<Product[]> {
  const {
    storeId,
    type,
    brand,
    searchQuery,
    page = 1,
    limit = 20,
    sortBy = 'productName',
    sortOrder = 'asc'
  } = params;

  const skip = (page - 1) * limit;
  const orderBy = { [sortBy]: sortOrder };

  // 検索条件の構築
  const where: any = { storeId };
  
  if (type) {
    where.type = type;
  }
  
  if (brand) {
    where.brand = brand;
  }
  
  if (searchQuery) {
    where.OR = [
      { productName: { contains: searchQuery, mode: 'insensitive' } },
      { brand: { contains: searchQuery, mode: 'insensitive' } },
      { colorName: { contains: searchQuery, mode: 'insensitive' } }
    ];
  }

  return prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: limit,
    include: {
      currentProductLots: true
    }
  });
}

/**
 * 製品在庫を追加する
 */
export async function addProductStock(params: AddProductStockParams): Promise<ProductLot> {
  const { productId, quantity, currentAmount, isInUse = false, addedBy } = params;

  // 製品の存在確認
  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  // ユーザーの存在確認
  const user = await prisma.user.findUnique({
    where: { id: addedBy }
  });

  if (!user) {
    throw new Error(`User with ID ${addedBy} not found`);
  }

  // 在庫のトランザクション更新
  const [productLot, updatedProduct] = await prisma.$transaction([
    // 製品ロットの作成
    prisma.productLot.create({
      data: {
        productId,
        isInUse,
        currentAmount: isInUse ? currentAmount : null,
        startedAt: isInUse ? new Date() : null
      }
    }),
    // 製品の在庫数更新
    prisma.product.update({
      where: { id: productId },
      data: {
        totalQuantity: { increment: quantity },
        lotQuantity: { increment: isInUse ? 0 : quantity },
        inUseQuantity: { increment: isInUse ? quantity : 0 }
      }
    })
  ]);

  // アクティビティの記録
  await prisma.activity.create({
    data: {
      userId: addedBy,
      type: 'INVENTORY',
      action: 'ADD_STOCK',
      metadata: {
        productId,
        quantity,
        isInUse,
        currentAmount
      }
    }
  });

  return productLot;
}

/**
 * 製品の使用を開始する（未使用→使用中に変更）
 */
export async function startUsingProduct(lotId: string, userId: string): Promise<ProductLot> {
  // ロットの存在確認
  const lot = await prisma.productLot.findUnique({
    where: { id: lotId },
    include: { product: true }
  });

  if (!lot) {
    throw new Error(`Product lot with ID ${lotId} not found`);
  }

  if (lot.isInUse) {
    throw new Error(`Product lot with ID ${lotId} is already in use`);
  }

  // ユーザーの存在確認
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }

  // トランザクションで更新
  const [updatedLot, updatedProduct] = await prisma.$transaction([
    // ロットを使用中に更新
    prisma.productLot.update({
      where: { id: lotId },
      data: {
        isInUse: true,
        currentAmount: lot.product.capacity, // 容量いっぱいで開始
        startedAt: new Date()
      }
    }),
    // 製品の在庫カウントを更新
    prisma.product.update({
      where: { id: lot.productId },
      data: {
        lotQuantity: { decrement: 1 },
        inUseQuantity: { increment: 1 }
      }
    })
  ]);

  // アクティビティの記録
  await prisma.activity.create({
    data: {
      userId,
      type: 'INVENTORY',
      action: 'START_USING',
      metadata: {
        productId: lot.productId,
        lotId
      }
    }
  });

  return updatedLot;
}

/**
 * 製品使用記録を登録する
 */
export async function recordProductUsage(params: RecordProductUsageParams): Promise<Usage> {
  const {
    productId,
    serviceTypeId,
    usageAmount,
    defaultAmount,
    nailLength,
    isCustomAmount = false,
    relatedProducts = [],
    note,
    recordedBy
  } = params;

  // 製品の存在確認
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      currentProductLots: {
        where: { isInUse: true },
        orderBy: { startedAt: 'asc' }
      }
    }
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  // 使用可能なロットがあるか確認
  if (product.currentProductLots.length === 0) {
    throw new Error(`No available product lots for product ${product.productName}`);
  }

  // 使用するロット（最も古く開始されたものを選択）
  const usedLot = product.currentProductLots[0];

  // サービスタイプの存在確認
  const serviceType = await prisma.serviceType.findUnique({
    where: { id: serviceTypeId }
  });

  if (!serviceType) {
    throw new Error(`Service type with ID ${serviceTypeId} not found`);
  }

  // ユーザーの存在確認
  const user = await prisma.user.findUnique({
    where: { id: recordedBy }
  });

  if (!user) {
    throw new Error(`User with ID ${recordedBy} not found`);
  }

  // 残量が足りるか確認
  if (usedLot.currentAmount !== null && usedLot.currentAmount < usageAmount) {
    throw new Error(`Not enough product left in lot. Current amount: ${usedLot.currentAmount}, Required: ${usageAmount}`);
  }

  // トランザクションで使用記録と在庫更新
  return prisma.$transaction(async (tx) => {
    // 使用記録の作成
    const usage = await tx.usage.create({
      data: {
        date: new Date(),
        usageAmount,
        defaultAmount,
        nailLength,
        isCustomAmount,
        isGelService: serviceType.isGelService,
        serviceTypeId,
        productId,
        usedLotId: usedLot.id,
        note
      }
    });

    // 使用ロットの残量更新
    await tx.productLot.update({
      where: { id: usedLot.id },
      data: {
        currentAmount: {
          decrement: usageAmount
        }
      }
    });

    // 関連製品の使用記録
    for (const related of relatedProducts) {
      // 関連製品の存在確認
      const relatedProduct = await tx.product.findUnique({
        where: { id: related.productId },
        include: {
          currentProductLots: {
            where: { isInUse: true },
            orderBy: { startedAt: 'asc' }
          }
        }
      });

      if (!relatedProduct || relatedProduct.currentProductLots.length === 0) {
        throw new Error(`No available lots for related product ${related.productId}`);
      }

      const relatedLot = relatedProduct.currentProductLots[0];

      // 関連製品の使用記録作成
      await tx.relatedProductUsage.create({
        data: {
          usageId: usage.id,
          productId: related.productId,
          amount: related.amount,
          defaultAmount: related.defaultAmount,
          isCustomAmount: related.isCustomAmount || false,
          role: related.role,
          order: related.order || 0,
          usedLotId: relatedLot.id
        }
      });

      // 関連製品ロットの残量更新
      await tx.productLot.update({
        where: { id: relatedLot.id },
        data: {
          currentAmount: {
            decrement: related.amount
          }
        }
      });
    }

    // 製品の使用統計更新
    await tx.product.update({
      where: { id: productId },
      data: {
        usageCount: { increment: 1 },
        lastUsed: new Date()
      }
    });

    // アクティビティ記録
    await tx.activity.create({
      data: {
        userId: recordedBy,
        type: 'INVENTORY',
        action: 'RECORD_USAGE',
        metadata: {
          usageId: usage.id,
          productId,
          serviceTypeId,
          usageAmount
        }
      }
    });

    return usage;
  });
}

/**
 * 製品の在庫状況を取得する
 */
export async function getProductStock(productId: string): Promise<{
  product: Product;
  totalCapacity: number;
  currentTotal: number;
  inUseLots: ProductLot[];
  unusedLots: ProductLot[];
  isLowStock: boolean;
}> {
  // 製品と関連ロットの取得
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      currentProductLots: true
    }
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  // 使用中と未使用のロットを分ける
  const inUseLots = product.currentProductLots.filter(lot => lot.isInUse);
  const unusedLots = product.currentProductLots.filter(lot => !lot.isInUse);

  // 総容量と現在の残量の計算
  let totalCapacity = 0;
  let currentTotal = 0;

  if (product.capacity) {
    totalCapacity = product.totalQuantity * (product.capacity || 0);
    
    // 使用中ロットの残量合計
    const inUseAmount = inUseLots.reduce((sum, lot) => sum + (lot.currentAmount || 0), 0);
    
    // 未使用ロットの容量合計
    const unusedAmount = unusedLots.length * (product.capacity || 0);
    
    currentTotal = inUseAmount + unusedAmount;
  } else {
    // 容量が設定されていない場合は個数で計算
    totalCapacity = product.totalQuantity;
    currentTotal = product.lotQuantity + inUseLots.length;
  }

  // 在庫不足判定
  const isLowStock = product.lotQuantity <= product.minStockAlert;

  return {
    product,
    totalCapacity,
    currentTotal,
    inUseLots,
    unusedLots,
    isLowStock
  };
}

/**
 * カテゴリ別に集計された在庫情報を取得する
 */
export async function getInventorySummary(storeId: string): Promise<{
  totalProducts: number;
  lowStockCount: number;
  categoryCounts: Record<string, number>;
  recentlyUsed: Product[];
}> {
  // 全製品数
  const totalProducts = await prisma.product.count({
    where: { storeId }
  });

  // 在庫不足製品数（各製品のminStockAlertと比較）
  const lowStockProducts = await prisma.product.findMany({
    where: {
      storeId,
      lotQuantity: {
        lte: prisma.product.fields.minStockAlert
      }
    }
  });

  // カテゴリ別集計
  const products = await prisma.product.findMany({
    where: { storeId },
    select: { type: true }
  });

  const categoryCounts: Record<string, number> = {};
  products.forEach(product => {
    categoryCounts[product.type] = (categoryCounts[product.type] || 0) + 1;
  });

  // 最近使用された製品
  const recentlyUsed = await prisma.product.findMany({
    where: {
      storeId,
      lastUsed: { not: null }
    },
    orderBy: { lastUsed: 'desc' },
    take: 5
  });

  return {
    totalProducts,
    lowStockCount: lowStockProducts.length,
    categoryCounts,
    recentlyUsed
  };
}