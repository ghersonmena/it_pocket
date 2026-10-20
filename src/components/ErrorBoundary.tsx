import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  // Al cambiar (p. ej. de módulo), se limpia el error y se vuelve a intentar mostrar el contenido
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey?: string;
}

// Si una pantalla falla al dibujarse, muestra un aviso con opción de reintentar en lugar de
// dejar la app en blanco
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  // Al cambiar de pantalla se descarta el error anterior
  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ITPocket] Error en pantalla:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
        <AlertTriangle size={36} color="#f59e0b" style={{ marginBottom: '10px' }} />
        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>Algo falló en esta pantalla</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '6px 0 14px', wordBreak: 'break-word' }}>
          {this.state.error.message}
        </p>
        <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
          <RotateCcw size={16} /> Reintentar
        </button>
      </div>
    );
  }
}
