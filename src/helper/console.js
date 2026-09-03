export function bindConsoleTag(tag) {
  const levels = ['log', 'info', 'warn', 'error']

  levels.forEach((level) => {
    const original = console[level]

    console[level] = function (...args) {
      original.call(console, tag, ...args)
    }
  })
}
