import { Component } from 'react';

// Catches a render-time crash in any page and shows a recoverable screen
// instead of a blank white app.
//
// Every page already handles its own *data* failures (loading, error with a
// Retry, empty states). This is the last resort for the other kind: a bug in
// rendering, or a response in a shape a page didn't expect. Without it, one
// such error unmounts the whole React tree and the booker is left with
// nothing to click.
//
// Error boundaries must be class components — there is no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nothing is sent anywhere — there is no error-reporting service in this
    // application — but the console keeps the stack for local debugging.
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="page-placeholder">
        <h2>Something went wrong on this page</h2>
        <p>
          The rest of the application is unaffected and no data has been lost. Try again, or move to another page from
          the menu.
        </p>
        <p className="muted">{this.state.error?.message}</p>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => this.setState({ error: null })}>
            Try Again
          </button>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
