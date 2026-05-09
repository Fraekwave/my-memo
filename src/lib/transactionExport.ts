import { generateTransactionCsv } from './transactionImport';
import { generatePortfolioTransferCsv } from './portfolioTransferCsv';
import type { PortfolioWithAssets } from '@/hooks/usePortfolios';
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
  downloadCsvFile({
    csv: generateTransactionCsv(transactions, assets),
    filename: `${safeFilename(portfolioName)}-transactions-${todayKst()}.csv`,
  });
}

export function downloadPortfolioCsv({
  portfolio,
}: {
  portfolio: PortfolioWithAssets;
}) {
  downloadCsvFile({
    csv: generatePortfolioTransferCsv(portfolio, 'portfolio'),
    filename: `${safeFilename(portfolio.portfolio.name)}-portfolio-${todayKst()}.csv`,
  });
}

export function downloadFullPortfolioCsv({
  portfolio,
  transactions,
}: {
  portfolio: PortfolioWithAssets;
  transactions: Transaction[];
}) {
  downloadCsvFile({
    csv: generatePortfolioTransferCsv(portfolio, 'full', transactions),
    filename: `${safeFilename(portfolio.portfolio.name)}-full-${todayKst()}.csv`,
  });
}

function downloadCsvFile({ csv, filename }: { csv: string; filename: string }) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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
