import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    // Advanced: Clear local storage if it's a persistent data corruption
    // localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            background: '#f8d7da',
            color: '#721c24',
            fontFamily: 'monospace',
          }}
        >
          <h2>⚠️ App Crashed</h2>
          <p>L'application a rencontré un problème inattendu.</p>
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'white',
              borderRadius: '8px',
              maxWidth: '800px',
              width: '100%',
              textAlign: 'left',
              overflow: 'auto',
            }}
          >
            <strong>Error:</strong>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: 'red' }}>
              {this.state.error?.toString()}
              {'\n'}\n{this.state.error?.stack}
            </pre>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={this.handleReload}
              style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
