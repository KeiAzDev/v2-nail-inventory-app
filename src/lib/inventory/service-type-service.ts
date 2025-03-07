import { PrismaClient, Type, NailLength, ServiceType, ServiceTypeProduct } from '@prisma/client';
import {prisma} from '../prisma';

// 施術タイプ作成用のインターフェース
interface CreateServiceTypeParams {
  name: string;
  defaultUsageAmount?: number;
  productType: Type; // 必須フィールドに変更
  isGelService?: boolean;
  requiresBase?: boolean;
  requiresTop?: boolean;
  shortLengthRate?: number;
  mediumLengthRate?: number;
  longLengthRate?: number;
  allowCustomAmount?: boolean;
  designVariant?: string;
  designUsageRate?: number;
  storeId: string;
  products?: Array<{
    productId: string;
    usageAmount: number;
    isRequired?: boolean;
    productRole?: string;
    order?: number;
  }>;
}

// 施術タイプ更新用のインターフェース
interface UpdateServiceTypeParams {
  id: string;
  name?: string;
  defaultUsageAmount?: number;
  productType?: Type;
  isGelService?: boolean;
  requiresBase?: boolean;
  requiresTop?: boolean;
  shortLengthRate?: number;
  mediumLengthRate?: number;
  longLengthRate?: number;
  allowCustomAmount?: boolean;
  designVariant?: string;
  designUsageRate?: number;
}

// 施術タイプに製品を追加/更新するためのインターフェース
interface UpsertServiceTypeProductParams {
  serviceTypeId: string;
  productId: string;
  usageAmount: number;
  isRequired?: boolean;
  productRole?: string;
  order?: number;
}

// 施術タイプのコピー用のインターフェース
interface CopyServiceTypeParams {
  sourceId: string;
  newName: string;
  designVariant?: string;
  designUsageRate?: number;
}

/**
 * 新しい施術タイプを作成する
 */
export async function createServiceType(params: CreateServiceTypeParams): Promise<ServiceType> {
  const {
    name,
    defaultUsageAmount = 0.5,
    productType,
    isGelService = false,
    requiresBase = false,
    requiresTop = false,
    shortLengthRate = 80,
    mediumLengthRate = 100,
    longLengthRate = 130,
    allowCustomAmount = false,
    designVariant,
    designUsageRate,
    storeId,
    products = []
  } = params;

  // 店舗の存在確認
  const store = await prisma.store.findUnique({
    where: { id: storeId }
  });

  if (!store) {
    throw new Error(`Store with ID ${storeId} not found`);
  }

  // 施術タイプ名の重複確認
  const existingServiceType = await prisma.serviceType.findFirst({
    where: {
      name,
      storeId
    }
  });

  if (existingServiceType) {
    throw new Error(`Service type with name "${name}" already exists in this store`);
  }

  // トランザクションで施術タイプと関連製品を作成
  return prisma.$transaction(async (tx) => {
    // 施術タイプを作成
    const serviceType = await tx.serviceType.create({
      data: {
        name,
        defaultUsageAmount,
        productType,
        isGelService,
        requiresBase,
        requiresTop,
        shortLengthRate,
        mediumLengthRate,
        longLengthRate,
        allowCustomAmount,
        designVariant,
        designUsageRate,
        storeId
      }
    });

    // 関連製品がある場合は登録
    if (products.length > 0) {
      for (const product of products) {
        await tx.serviceTypeProduct.create({
          data: {
            serviceTypeId: serviceType.id,
            productId: product.productId,
            usageAmount: product.usageAmount,
            isRequired: product.isRequired ?? true,
            productRole: product.productRole,
            order: product.order ?? 0
          }
        });
      }
    }

    return serviceType;
  });
}

/**
 * 施術タイプを更新する
 */
export async function updateServiceType(params: UpdateServiceTypeParams): Promise<ServiceType> {
  const { id, ...updateData } = params;

  // 施術タイプの存在確認
  const existingServiceType = await prisma.serviceType.findUnique({
    where: { id }
  });

  if (!existingServiceType) {
    throw new Error(`Service type with ID ${id} not found`);
  }

  // 施術タイプの更新
  return prisma.serviceType.update({
    where: { id },
    data: updateData
  });
}

/**
 * 施術タイプに製品を追加または更新する
 */
export async function upsertServiceTypeProduct(params: UpsertServiceTypeProductParams): Promise<ServiceTypeProduct> {
  const {
    serviceTypeId,
    productId,
    usageAmount,
    isRequired = true,
    productRole,
    order = 0
  } = params;

  // 施術タイプの存在確認
  const serviceType = await prisma.serviceType.findUnique({
    where: { id: serviceTypeId }
  });

  if (!serviceType) {
    throw new Error(`Service type with ID ${serviceTypeId} not found`);
  }

  // 製品の存在確認
  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  // 既存の関連があるか確認
  const existingRelation = await prisma.serviceTypeProduct.findFirst({
    where: {
      serviceTypeId,
      productId
    }
  });

  if (existingRelation) {
    // 既存の関連を更新
    return prisma.serviceTypeProduct.update({
      where: { id: existingRelation.id },
      data: {
        usageAmount,
        isRequired,
        productRole,
        order
      }
    });
  } else {
    // 新しい関連を作成
    return prisma.serviceTypeProduct.create({
      data: {
        serviceTypeId,
        productId,
        usageAmount,
        isRequired,
        productRole,
        order
      }
    });
  }
}

/**
 * 施術タイプから製品を削除する
 */
export async function removeProductFromServiceType(serviceTypeId: string, productId: string): Promise<void> {
  // 関連の存在確認
  const existingRelation = await prisma.serviceTypeProduct.findFirst({
    where: {
      serviceTypeId,
      productId
    }
  });

  if (!existingRelation) {
    throw new Error(`Product with ID ${productId} is not associated with service type ${serviceTypeId}`);
  }

  // 関連を削除
  await prisma.serviceTypeProduct.delete({
    where: { id: existingRelation.id }
  });
}

/**
 * 施術タイプをコピーする（バリエーション作成等に便利）
 */
export async function copyServiceType(params: CopyServiceTypeParams): Promise<ServiceType> {
  const { sourceId, newName, designVariant, designUsageRate } = params;

  // 元の施術タイプを取得
  const sourceServiceType = await prisma.serviceType.findUnique({
    where: { id: sourceId },
    include: {
      serviceTypeProducts: true
    }
  });

  if (!sourceServiceType) {
    throw new Error(`Source service type with ID ${sourceId} not found`);
  }

  // 名前の重複確認
  const existingServiceType = await prisma.serviceType.findFirst({
    where: {
      name: newName,
      storeId: sourceServiceType.storeId
    }
  });

  if (existingServiceType) {
    throw new Error(`Service type with name "${newName}" already exists in this store`);
  }

  // トランザクションで施術タイプと関連製品をコピー
  return prisma.$transaction(async (tx) => {
    // 新しい施術タイプを作成
    const newServiceType = await tx.serviceType.create({
      data: {
        name: newName,
        defaultUsageAmount: sourceServiceType.defaultUsageAmount,
        productType: sourceServiceType.productType,
        isGelService: sourceServiceType.isGelService,
        requiresBase: sourceServiceType.requiresBase,
        requiresTop: sourceServiceType.requiresTop,
        shortLengthRate: sourceServiceType.shortLengthRate,
        mediumLengthRate: sourceServiceType.mediumLengthRate,
        longLengthRate: sourceServiceType.longLengthRate,
        allowCustomAmount: sourceServiceType.allowCustomAmount,
        designVariant: designVariant || sourceServiceType.designVariant,
        designUsageRate: designUsageRate || sourceServiceType.designUsageRate,
        storeId: sourceServiceType.storeId
      }
    });

    // 関連製品をコピー
    for (const product of sourceServiceType.serviceTypeProducts) {
      await tx.serviceTypeProduct.create({
        data: {
          serviceTypeId: newServiceType.id,
          productId: product.productId,
          usageAmount: product.usageAmount,
          isRequired: product.isRequired,
          productRole: product.productRole,
          order: product.order
        }
      });
    }

    return newServiceType;
  });
}

/**
 * 施術タイプの詳細を取得する
 */
export async function getServiceTypeWithProducts(id: string): Promise<ServiceType & { serviceTypeProducts: ServiceTypeProduct[] }> {
  const serviceType = await prisma.serviceType.findUnique({
    where: { id },
    include: {
      serviceTypeProducts: {
        include: {
          product: true
        },
        orderBy: {
          order: 'asc'
        }
      }
    }
  });

  if (!serviceType) {
    throw new Error(`Service type with ID ${id} not found`);
  }

  return serviceType;
}

/**
 * 店舗の施術タイプ一覧を取得する
 */
export async function getServiceTypes(storeId: string, includeProducts: boolean = false): Promise<ServiceType[]> {
  return prisma.serviceType.findMany({
    where: { storeId },
    include: {
      serviceTypeProducts: includeProducts ? {
        include: {
          product: true
        },
        orderBy: {
          order: 'asc'
        }
      } : false
    },
    orderBy: {
      name: 'asc'
    }
  });
}

/**
 * 使用量を計算する（爪の長さを考慮）
 */
export function calculateAdjustedUsageAmount(
  serviceType: ServiceType,
  baseAmount: number,
  nailLength: NailLength
): number {
  let ratePercentage;

  switch (nailLength) {
    case NailLength.SHORT:
      ratePercentage = serviceType.shortLengthRate;
      break;
    case NailLength.MEDIUM:
      ratePercentage = serviceType.mediumLengthRate;
      break;
    case NailLength.LONG:
      ratePercentage = serviceType.longLengthRate;
      break;
    default:
      ratePercentage = 100;
  }

  // デザインバリエーションによる調整（設定されている場合）
  if (serviceType.designUsageRate) {
    ratePercentage = Math.round(ratePercentage * serviceType.designUsageRate);
  }

  return parseFloat((baseAmount * (ratePercentage / 100)).toFixed(2));
}

/**
 * 指定月の施術タイプ統計を取得する
 */
export async function getMonthlyServiceStats(serviceTypeId: string, year: number, month: number) {
  const stats = await prisma.monthlyServiceStat.findUnique({
    where: {
      monthlyStatIdentifier: {
        serviceTypeId,
        year,
        month
      }
    }
  });

  return stats;
}

/**
 * 月間統計を更新する（使用記録後に呼び出し）
 */
export async function updateMonthlyStats(serviceTypeId: string, usageAmount: number, date: Date = new Date()): Promise<void> {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 0-indexed to 1-indexed

  // 既存の統計データを検索
  const existingStat = await prisma.monthlyServiceStat.findUnique({
    where: {
      monthlyStatIdentifier: {
        serviceTypeId,
        year,
        month
      }
    }
  });

  if (existingStat) {
    // 既存データを更新
    await prisma.monthlyServiceStat.update({
      where: { id: existingStat.id },
      data: {
        totalUsage: existingStat.totalUsage + usageAmount,
        usageCount: existingStat.usageCount + 1,
        averageUsage: (existingStat.totalUsage + usageAmount) / (existingStat.usageCount + 1)
      }
    });
  } else {
    // 新規データを作成
    await prisma.monthlyServiceStat.create({
      data: {
        serviceTypeId,
        year,
        month,
        totalUsage: usageAmount,
        usageCount: 1,
        averageUsage: usageAmount
      }
    });
  }
}