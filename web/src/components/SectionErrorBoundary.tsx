import { Component } from 'react'
import type { ReactNode } from 'react'

type SectionErrorBoundaryProps = {
  children: ReactNode
  resetKey: string
}

type SectionErrorBoundaryState = {
  hasError: boolean
}

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps: SectionErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return <section role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
      <p className="font-display text-lg font-extrabold text-red-900">This workspace section could not load.</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-red-800">The application is still available. Reload to retry downloading this section.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-2xl bg-red-800 px-4 py-2.5 font-display text-sm font-extrabold text-white transition hover:bg-red-900">
        Reload section
      </button>
    </section>
  }
}
