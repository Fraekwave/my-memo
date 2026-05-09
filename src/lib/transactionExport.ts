import { generateTransactionCsv } from './transactionImport';
import type { PortfolioAsset, Transaction } from './types';

export function downloadTransactionCsv({
  portfolioName,
  transactions,
  assets,
}: {
  portfolioName: string;
  transactions: Transaction[];
  assets: PortfolioAsset[];
}) {
  const csv = generateTransactionCsv(transactions, assets);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(portfolioName)}-transactions-${todayKst()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayKst(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function safeFilename(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');
  return cleaned || 'portfolio';
}
