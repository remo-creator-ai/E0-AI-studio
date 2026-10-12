import React from 'react';
import { BRAND } from '../lib/brand';

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <span className="e0-brand" aria-label={BRAND.name}>
    <img src={BRAND.logo} alt="" width="40" height="40" />
    {!compact && <span><strong>E0 <span>AI STUDIO</span></strong><small>BRAND CONTENT WORKSPACE</small></span>}
  </span>;
}
