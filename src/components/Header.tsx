import React from 'react';
import type { GLPISession } from '../types/glpi';
import { ShieldCheck, Sparkles, Menu } from 'lucide-react';
import { BrandLogo, BrandWordmark } from './BrandLogo';

interface HeaderProps {
  session: GLPISession | null;
  title?: string;
  onMenu?: () => void; // abre el menú lateral (☰)
}

export const Header: React.FC<HeaderProps> = ({ session, title, onMenu }) => {
  return (
    <header className="app-header">
      <div className="brand-badge">
        {session && onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Abrir menú"
            title="Menú"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px',
              border: 'none', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.08)', color: 'var(--brand-amber)', cursor: 'pointer'
            }}
          >
            <Menu size={22} />
          </button>
        )}
        <div className="brand-logo"><BrandLogo size={36} /></div>
        <div>
          <div className="brand-title">{title || <BrandWordmark />}</div>
          {session && (
            <div className="brand-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={12} color="#10b981" />
              {session.activeProfile || 'Usuario'}
            </div>
          )}
        </div>
      </div>

      {session && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {session.isMock && (
            <span 
              className="badge" 
              style={{ backgroundColor: '#fef3c7', color: '#b45309', fontSize: '0.68rem', padding: '3px 8px' }}
              title="Modo Demostración Activado"
            >
              <Sparkles size={10} /> MOCK DEMO
            </span>
          )}
        </div>
      )}
    </header>
  );
};
