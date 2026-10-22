import React, { useState } from 'react';
import type { GLPIAuthConfig, GLPISession } from '../types/glpi';
import { GLPIService } from '../services/glpiService';
import { User, Lock, Key, Server, Eye, EyeOff, Loader2, AlertCircle, Sparkles, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

const REPO_URL = 'https://github.com/ghersonmena/it_pocket';

// Logo de GitHub (lucide-react ya no incluye logos de marcas)
const GitHubMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

interface LoginProps {
  onLoginSuccess: (session: GLPISession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  // Configuración leída por defecto de variables de entorno (.env)
  const envUrl = import.meta.env.VITE_GLPI_URL || '';
  const envAppToken = import.meta.env.VITE_GLPI_APP_TOKEN || '';
  // Si vienen del .env no se muestran ni se piden: solo se indica que están cargados
  const hasEnvUrl = envUrl.trim() !== '';
  const hasEnvAppToken = envAppToken.trim() !== '';
  const serverFromEnv = hasEnvUrl && hasEnvAppToken;

  const [authMode, setAuthMode] = useState<'credentials' | 'user_token'>('credentials');
  const [baseUrl, setBaseUrl] = useState<string>(envUrl);
  const [appToken, setAppToken] = useState<string>(envAppToken);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [userToken, setUserToken] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showServerConfig, setShowServerConfig] = useState<boolean>(!serverFromEnv);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!baseUrl.trim()) {
      setError('Por favor ingresa la URL de tu servidor GLPI.');
      return;
    }

    if (!appToken.trim()) {
      setError('Se requiere el App-Token de GLPI. Puedes ponerlo en el archivo .env (VITE_GLPI_APP_TOKEN) o configurarlo en pantalla.');
      return;
    }

    if (authMode === 'credentials' && (!username.trim() || !password)) {
      setError('Ingresa tu nombre de usuario y contraseña de GLPI.');
      return;
    }

    if (authMode === 'user_token' && !userToken.trim()) {
      setError('Ingresa tu Token de Usuario de GLPI.');
      return;
    }

    setLoading(true);

    try {
      const config: GLPIAuthConfig = {
        baseUrl: baseUrl.trim(),
        appToken: appToken.trim(),
        username: authMode === 'credentials' ? username.trim() : undefined,
        password: authMode === 'credentials' ? password : undefined,
        userToken: authMode === 'user_token' ? userToken.trim() : undefined,
        useMock: false
      };

      const session = await GLPIService.initSession(config);
      onLoginSuccess(session);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Error al conectar con la API de GLPI.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const demoConfig: GLPIAuthConfig = {
        baseUrl: baseUrl || 'http://demo.glpi.local',
        appToken: appToken || 'demo_app_token',
        username: 'glpi_demo_admin',
        useMock: true
      };
      const session = await GLPIService.initSession(demoConfig);
      onLoginSuccess(session);
    } catch (err: any) {
      setError('Error al iniciar modo Demo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '8px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'inline-flex', marginBottom: '12px', filter: 'drop-shadow(0 8px 18px rgba(28, 31, 38, 0.3))' }}>
          <BrandLogo size={96} title="ITPocket" />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
          Acceso a <span className="brand-wordmark"><b style={{ color: 'var(--primary)' }}>IT</b><span>Pocket</span></span>
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Conéctate a tu mesa de ayuda empresarial
        </p>
      </div>

      {/* Selector de tipo de autenticación */}
      <div 
        style={{
          display: 'flex',
          background: 'var(--bg-main)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          marginBottom: '18px'
        }}
      >
        <button
          type="button"
          onClick={() => setAuthMode('credentials')}
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            borderRadius: '10px',
            background: authMode === 'credentials' ? 'var(--card-bg)' : 'transparent',
            color: authMode === 'credentials' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
            boxShadow: authMode === 'credentials' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Usuario y Clave
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('user_token')}
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            borderRadius: '10px',
            background: authMode === 'user_token' ? 'var(--card-bg)' : 'transparent',
            color: authMode === 'user_token' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
            boxShadow: authMode === 'user_token' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          Token de Usuario
        </button>
      </div>

      {error && (
        <div className="alert-box alert-error animate-fade-in">
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Error de Conexión</strong>
            <div style={{ marginTop: '2px', fontWeight: 500 }}>{error}</div>
          </div>
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div className="card">
          {authMode === 'credentials' ? (
            <>
              <div className="form-group">
                <label className="form-label">Usuario GLPI</label>
                <div className="input-wrapper">
                  <User className="input-icon" size={18} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. tech_admin o tu usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoCapitalize="none"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contraseña</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    style={{ paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">GLPI User Token</label>
              <div className="input-wrapper">
                <Key className="input-icon" size={18} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ej. xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={userToken}
                  onChange={(e) => setUserToken(e.target.value)}
                  disabled={loading}
                />
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '6px', display: 'block' }}>
                Token de usuario configurado en la ficha de tu perfil en GLPI.
              </small>
            </div>
          )}
        </div>

        {/* Servidor y App-Token: si vienen del .env solo se confirma que están cargados */}
        {serverFromEnv ? (
          <div
            className="card"
            style={{
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.35)'
            }}
          >
            <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#059669' }}>Servidor GLPI configurado</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>URL y App-Token cargados desde la configuración</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '12px 18px' }}>
            <div
              onClick={() => setShowServerConfig(!showServerConfig)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={18} color="var(--primary)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  Configuración del Servidor
                </span>
              </div>
              {showServerConfig ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>

            {showServerConfig && (
              <div className="animate-fade-in" style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed var(--border-color)' }}>
                {hasEnvUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#059669', marginBottom: '12px' }}>
                    <CheckCircle2 size={14} /> URL del servidor cargada
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">URL del Servidor GLPI</label>
                    <div className="input-wrapper">
                      <Server className="input-icon" size={18} />
                      <input
                        type="url"
                        className="form-input"
                        placeholder="https://glpi.midominio.com"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </div>
                )}

                {hasEnvAppToken ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#059669' }}>
                    <CheckCircle2 size={14} /> App-Token cargado
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label className="form-label">GLPI App-Token</label>
                    <div className="input-wrapper">
                      <Key className="input-icon" size={18} />
                      <input
                        type="password"
                        autoComplete="off"
                        className="form-input"
                        placeholder="Generado en Configuración -> API en GLPI"
                        value={appToken}
                        onChange={(e) => setAppToken(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ marginTop: '10px' }}
        >
          {loading ? (
            <>
              <Loader2 className="spin" size={20} /> Conectando a GLPI...
            </>
          ) : (
            'Ingresar a GLPI'
          )}
        </button>
      </form>

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />
          <span 
            style={{
              position: 'absolute',
              top: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-main)',
              padding: '0 10px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              fontWeight: 600
            }}
          >
            O MODO DE PRUEBA
          </span>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleDemoLogin}
          disabled={loading}
        >
          <Sparkles size={16} color="#f59e0b" />
          Probar con Datos Demo (Modo Sandbox)
        </button>
      </div>

      {/* Enlace discreto al repositorio */}
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '22px auto 4px',
          width: 'fit-content', padding: '6px 10px', borderRadius: '999px',
          fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none'
        }}
      >
        <GitHubMark size={15} /> Ver más en GitHub
      </a>
    </div>
  );
};
