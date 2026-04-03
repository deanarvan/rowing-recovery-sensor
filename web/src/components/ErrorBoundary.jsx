import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error: error, errorInfo: errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center p-8 bg-slate-900 text-red-400">
                    <div className="max-w-2xl bg-slate-800 p-8 rounded-lg shadow-xl border border-red-900">
                        <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
                        <pre className="whitespace-pre-wrap font-mono text-xs bg-black/50 p-4 rounded overflow-auto max-h-96">
                            {this.state.error && this.state.error.toString()}
                            <br />
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
