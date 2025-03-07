import { PrismaClient, Type } from '@prisma/client';
import {prisma} from '../prisma';

// ダッシュボード概要のインターフェース
interface DashboardSummary {
  totalProducts: number;
  lowStockProducts: number;
  totalServiceTypes: number;
  totalUsageRecords: number;
  recentActivity: any[];
}

// 在庫概要のインターフェース
interface InventorySummary {
  totalProducts: number;
  lowStockCount: number;
  categoryBreakdown: {
    category: Type;
    count: number;
    percentage: number;
  }[];
  recentlyUsed: any[];
  stockAlerts: any[];
}

// 使用統計のインターフェース
interface UsageStatistics {
  topUsedProducts: {
    product: any;
    usageCount: number;
    totalAmount: number;
  }[];
  topServiceTypes: {
    serviceType: any;
    usageCount: number;
  }[];
  monthlyUsageTrend: {
    month: string;
    total: number;
  }[];
  usageByCategory: {
    category: Type;
    count: number;
    percentage: number;
  }[];
}

// 将来予測のインターフェース
interface FuturePredictions {
  productsToReorder: {
    product: any;
    daysLeft: number;
    estimatedReorderDate: Date;
  }[];
  expectedUsageByMonth: {
    month: string;
    predictedAmount: number;
  }[];
}

/**
 * ダッシュボードの概要情報を取得する
 */
export async function getDashboardSummary(storeId: string): Promise<DashboardSummary> {
  // 製品の総数
  const totalProducts = await prisma.product.count({
    where: { storeId }
  });

  // 在庫不足の製品数
  const lowStockProducts = await prisma.product.count({
    where: {
      storeId,
      lotQuantity: {
        lte: prisma.product.fields.minStockAlert
      }
    }
  });

  // 施術タイプの総数
  const totalServiceTypes = await prisma.serviceType.count({
    where: { storeId }
  });

  // 使用記録の総数
  const usageRecords = await prisma.usage.count({
    where: {
      product: {
        storeId
      }
    }
  });

  // 最近のアクティビティ
  const recentActivity = await prisma.activity.findMany({
    where: {
      user: {
        storeId
      }
    },
    include: {
      user: {
        select: {
          name: true,
          role: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10
  });

  return {
    totalProducts,
    lowStockProducts,
    totalServiceTypes,
    totalUsageRecords: usageRecords,
    recentActivity
  };
}

/**
 * 在庫の概要情報を取得する
 */
export async function getInventorySummary(storeId: string): Promise<InventorySummary> {
  // 製品の総数
  const totalProducts = await prisma.product.count({
    where: { storeId }
  });

  // 在庫不足の製品
  const lowStockProducts = await prisma.product.findMany({
    where: {
      storeId,
      lotQuantity: {
        lte: prisma.product.fields.minStockAlert
      }
    }
  });

  // カテゴリ別製品数
  const categoryGroups = await prisma.product.groupBy({
    by: ['type'],
    where: { storeId },
    _count: {
      id: true
    }
  });

  const categoryBreakdown = categoryGroups.map(group => ({
    category: group.type,
    count: group._count.id,
    percentage: Math.round((group._count.id / totalProducts) * 100)
  }));

  // 最近使用された製品
  const recentlyUsed = await prisma.product.findMany({
    where: {
      storeId,
      lastUsed: { not: null }
    },
    orderBy: {
      lastUsed: 'desc'
    },
    take: 5
  });

  // 在庫アラート対象の製品
  const stockAlerts = await prisma.product.findMany({
    where: {
      storeId,
      OR: [
        // 未使用ロット数が少ない
        {
          lotQuantity: {
            lte: prisma.product.fields.minStockAlert
          }
        },
        // 残量が少ない使用中ロットがある
        {
          currentProductLots: {
            some: {
              isInUse: true,
              // 注: 以下のロジックは別の方法で実装する必要があります
              // currentAmountが容量の一定割合以下の場合
              currentAmount: {
                not: null,
                lte: 5 // 固定値で代用（本来は計算すべき）
              }
            }
          }
        }
      ]
    },
    include: {
      currentProductLots: {
        where: {
          isInUse: true
        }
      }
    },
    take: 10
  });

  return {
    totalProducts,
    lowStockCount: lowStockProducts.length,
    categoryBreakdown,
    recentlyUsed,
    stockAlerts
  };
}

/**
 * 使用統計情報を取得する
 */
export async function getUsageStatistics(storeId: string, period: 'week' | 'month' | 'year' = 'month'): Promise<UsageStatistics> {
  let dateFilter: any;
  
  // 期間フィルターの設定
  const now = new Date();
  if (period === 'week') {
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    dateFilter = { gte: lastWeek };
  } else if (period === 'month') {
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    dateFilter = { gte: lastMonth };
  } else if (period === 'year') {
    const lastYear = new Date(now);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    dateFilter = { gte: lastYear };
  }

  // 最もよく使われる製品 - 手動集計アプローチ
  const usagesWithCount = await prisma.usage.findMany({
    where: {
      date: dateFilter,
      product: { storeId }
    },
    include: {
      product: true
    }
  });
  
  // 製品IDごとに使用回数と合計量を集計
  const productUsageMap = new Map<string, { productId: string, count: number, totalAmount: number }>();
  
  usagesWithCount.forEach(usage => {
    const { productId, usageAmount } = usage;
    const current = productUsageMap.get(productId) || { productId, count: 0, totalAmount: 0 };
    
    productUsageMap.set(productId, {
      productId,
      count: current.count + 1,
      totalAmount: current.totalAmount + (usageAmount || 0)
    });
  });
  
  // 使用回数の多い順にソート
  const topProductUsages = Array.from(productUsageMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // 製品の詳細情報を取得
  const topUsedProductsWithDetails = await Promise.all(
    topProductUsages.map(async item => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      });
      return {
        product,
        usageCount: item.count,
        totalAmount: item.totalAmount
      };
    })
  );
  
  // 最もよく使われる施術タイプ - 手動集計アプローチ
  const serviceTypeUsageMap = new Map<string, { serviceTypeId: string, count: number }>();
  
  usagesWithCount.forEach(usage => {
    const { serviceTypeId } = usage;
    const current = serviceTypeUsageMap.get(serviceTypeId) || { serviceTypeId, count: 0 };
    
    serviceTypeUsageMap.set(serviceTypeId, {
      serviceTypeId,
      count: current.count + 1
    });
  });
  
  // 使用回数の多い順にソート
  const topServiceTypeUsages = Array.from(serviceTypeUsageMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // 施術タイプの詳細情報を取得
  const topServiceTypesWithDetails = await Promise.all(
    topServiceTypeUsages.map(async item => {
      const serviceType = await prisma.serviceType.findUnique({
        where: { id: item.serviceTypeId }
      });
      return {
        serviceType,
        usageCount: item.count
      };
    })
  );

  // 月別使用傾向 - rawクエリの代わりに単純化したアプローチを使用
  // 過去12ヶ月の月別データを手動で集計
  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  
  const usages = await prisma.usage.findMany({
    where: {
      date: { gte: lastYear },
      product: { storeId }
    },
    select: {
      date: true,
      usageAmount: true
    }
  });
  
  // 月別に集計
  const monthlyDataMap = new Map<string, number>();
  
  usages.forEach(usage => {
    const year = usage.date.getFullYear();
    const month = usage.date.getMonth() + 1;
    const key = `${year}-${month.toString().padStart(2, '0')}`;
    
    const currentAmount = monthlyDataMap.get(key) || 0;
    monthlyDataMap.set(key, currentAmount + (usage.usageAmount || 0));
  });
  
  // 集計データを配列に変換
  const monthlyUsageTrend = Array.from(monthlyDataMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // カテゴリ別使用状況 - 手動集計アプローチ
  const usagesWithProducts = await prisma.usage.findMany({
    where: {
      date: dateFilter,
      product: { storeId }
    },
    include: {
      product: {
        select: { type: true }
      }
    }
  });
  
  // カテゴリ別にグループ化して集計
  const categoryCountMap = new Map<Type, number>();
  
  usagesWithProducts.forEach(usage => {
    const type = usage.product.type;
    const currentCount = categoryCountMap.get(type) || 0;
    categoryCountMap.set(type, currentCount + 1);
  });
  
  // 総使用回数の計算
  const totalUsageCount = usagesWithProducts.length;
  
  // カテゴリ別使用状況をフォーマット
  const usageByCategory = Array.from(categoryCountMap.entries())
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalUsageCount > 0 ? Math.round((count / totalUsageCount) * 100) : 0
    }));

  return {
    topUsedProducts: topUsedProductsWithDetails,
    topServiceTypes: topServiceTypesWithDetails,
    monthlyUsageTrend,
    usageByCategory
  };
}

/**
 * 将来予測情報を取得する
 */
export async function getFuturePredictions(storeId: string): Promise<FuturePredictions> {
  // 使用傾向に基づく再注文予測
  const productsWithUsage = await prisma.product.findMany({
    where: {
      storeId,
      usageCount: { gt: 0 }, // 使用記録がある製品のみ
      lastUsed: { not: null }
    },
    include: {
      currentProductLots: {
        where: { isInUse: true }
      },
      usages: {
        orderBy: { date: 'desc' },
        take: 30 // 最近の使用記録
      }
    }
  });

  // 再注文が必要な製品を計算
  const productsToReorder = productsWithUsage
    .map(product => {
      // 平均使用量の計算
      if (product.usages.length === 0) return null;

      // 初回と最新の使用日を取得
      const firstUsageDate = product.usages[product.usages.length - 1].date;
      const lastUsageDate = product.usages[0].date;

      // 使用期間（日数）の計算
      const usagePeriodDays = Math.max(
        1,
        Math.ceil((lastUsageDate.getTime() - firstUsageDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      // 1日あたりの平均使用量
      const totalUsage = product.usages.reduce((sum, usage) => sum + usage.usageAmount, 0);
      const dailyUsage = totalUsage / usagePeriodDays;

      // 現在の残量計算
      let currentAmount = 0;
      
      // 使用中のロットの残量
      const inUseAmount = product.currentProductLots
        .filter(lot => lot.isInUse)
        .reduce((sum, lot) => sum + (lot.currentAmount || 0), 0);
      
      // 未使用ロットの残量
      const unusedAmount = product.lotQuantity * (product.capacity || 1);
      
      currentAmount = inUseAmount + unusedAmount;

      // 残り日数の計算
      const daysLeft = dailyUsage > 0 ? Math.ceil(currentAmount / dailyUsage) : 999;

      // 予想再注文日の計算
      const estimatedReorderDate = new Date();
      estimatedReorderDate.setDate(estimatedReorderDate.getDate() + daysLeft);

      return {
        product,
        daysLeft,
        estimatedReorderDate
      };
    })
    .filter((item): item is { product: any, daysLeft: number, estimatedReorderDate: Date } => 
      item !== null && item.daysLeft < 30
    ) // nullでなく、30日以内に再注文が必要な製品のみ
    .sort((a, b) => a.daysLeft - b.daysLeft); // 残り日数の少ない順

  // 月別予測使用量
  const monthlyPredictions = await prisma.monthlyServiceStat.findMany({
    where: {
      serviceType: {
        storeId
      }
    },
    orderBy: [
      { year: 'desc' },
      { month: 'desc' }
    ],
    take: 12 // 直近12ヶ月のデータ
  });

  // 今後6ヶ月間の予測
  const expectedUsageByMonth = [];
  const now = new Date();
  
  for (let i = 1; i <= 6; i++) {
    const predictionMonth = new Date(now);
    predictionMonth.setMonth(now.getMonth() + i);
    const year = predictionMonth.getFullYear();
    const month = predictionMonth.getMonth() + 1;
    
    // 昨年同月のデータを基準に予測
    const lastYearData = monthlyPredictions.find(
      data => data.month === month && data.year === year - 1
    );
    
    let predictedAmount = 0;
    
    if (lastYearData) {
      // 昨年のデータがある場合は、それを基に予測（季節要因を考慮）
      predictedAmount = lastYearData.totalUsage * (lastYearData.seasonalRate || 1);
    } else {
      // 昨年のデータがない場合は、直近3ヶ月の平均を使用
      const recentMonths = monthlyPredictions.slice(0, 3);
      if (recentMonths.length > 0) {
        predictedAmount = recentMonths.reduce((sum, data) => sum + data.totalUsage, 0) / recentMonths.length;
      }
    }
    
    expectedUsageByMonth.push({
      month: `${year}-${month.toString().padStart(2, '0')}`,
      predictedAmount: Math.round(predictedAmount * 100) / 100
    });
  }

  return {
    productsToReorder,
    expectedUsageByMonth
  };
}