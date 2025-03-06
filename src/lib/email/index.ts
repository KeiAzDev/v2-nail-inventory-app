// src/lib/email/index.ts
export async function sendInvitationEmail(to: string, inviteCode: string, storeName: string) {
  // 実際の実装は後ほど
  console.log(`メール送信: ${to}, 招待コード: ${inviteCode}, 店舗: ${storeName}`);
  return { success: true };
}