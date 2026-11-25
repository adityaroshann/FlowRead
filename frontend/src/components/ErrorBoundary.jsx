import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page error-page" id="main">
          <h1 className="display">Something went wrong</h1>
          <p>This page stopped working. Your documents are still saved in this browser.</p>
          <p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
