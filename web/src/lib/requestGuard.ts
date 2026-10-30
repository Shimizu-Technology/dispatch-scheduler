// Each resource has its own sequence: independent reads must not cancel one another.
export class RequestGuard {
  private versions = new Map<string, number>()
  private active = true
  private generation = 0

  begin(resource: string, matchesContext: () => boolean = () => true) {
    const version = (this.versions.get(resource) || 0) + 1
    this.versions.set(resource, version)
    const generation = this.generation
    return () => this.active && this.generation === generation && this.versions.get(resource) === version && matchesContext()
  }

  activate() { this.active = true }
  dispose() {
    this.active = false
    this.generation += 1
    this.versions.clear()
  }
}
