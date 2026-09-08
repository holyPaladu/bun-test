export type PrometheusCollector = () => string[] | Promise<string[]>

export interface PrometheusRegistry {
  register(name: string, collector: PrometheusCollector): void
  render(additionalCollectors?: PrometheusCollector[]): Promise<string>
}

/** Registry принадлежит одному процессу и не хранит глобального состояния. */
export const createPrometheusRegistry = (): PrometheusRegistry => {
  const collectors = new Map<string, PrometheusCollector>()

  return {
    register: (name, collector) => {
      if (collectors.has(name)) throw new Error(`Prometheus collector already registered: ${name}`)
      collectors.set(name, collector)
    },
    render: async (additionalCollectors = []) => {
      const lines: string[] = []
      for (const collector of [...collectors.values(), ...additionalCollectors]) {
        lines.push(...await collector())
      }
      return `${lines.join('\n')}\n`
    },
  }
}

export const prometheusLabel = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
