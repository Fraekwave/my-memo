import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트 초기화
 * 
 * ⚠️ 보안 주의:
 * - 환경 변수는 .env 파일에서 관리됩니다
 * - .env 파일은 .gitignore에 포함되어 Git에 커밋되지 않습니다
 * - 배포 시 Vercel/Netlify 등의 환경 변수 설정 필요
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase 환경 변수가 설정되지 않았습니다.\n' +
    '.env 파일을 생성하고 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정해주세요.'
  );
}

/**
 * 싱글톤 패턴: 애플리케이션 전체에서 하나의 인스턴스만 사용
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
