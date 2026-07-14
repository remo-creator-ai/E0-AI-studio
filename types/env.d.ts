/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ADMIN_EMAIL?: string;
  // 디자인(가계정) 모드 스위치: 'true' 강제 ON / 'false' 강제 OFF / 미지정 시 VITE_SUPABASE_URL 없으면 자동 ON
  readonly VITE_MOCK_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
