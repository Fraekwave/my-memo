-- Simplify asset categories for MamaVault Portfolio mode.
--
-- Before: 국내주식, 해외주식, 채권, 금, 원자재, 리츠, 암호화폐, 기타
-- After:  주식,               채권, 금, 원자재, 리츠, 암호화폐, 현금
--
-- Mapping: 국내주식+해외주식 → 주식;  기타 → 현금

-- Drop the old CHECK first so the UPDATE can succeed
ALTER TABLE portfolio_assets DROP CONSTRAINT IF EXISTS portfolio_assets_category_check;

UPDATE portfolio_assets SET category = '주식' WHERE category IN ('국내주식', '해외주식');
UPDATE portfolio_assets SET category = '현금' WHERE category = '기타';

ALTER TABLE portfolio_assets ADD CONSTRAINT portfolio_assets_category_check
  CHECK (category IN ('주식', '채권', '금', '원자재', '리츠', '암호화폐', '현금'));

ALTER TABLE portfolio_assets ALTER COLUMN category SET DEFAULT '주식';
