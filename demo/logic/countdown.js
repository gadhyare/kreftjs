// use timer = countdown(10)  →  timer.left, timer.running, timer.start(), timer.stop(), timer.reset()
export function countdown(seconds) {
  const timer = Kreftjs.state({
    left: seconds,
    running: false,
    get done() { return this.left === 0 },
    start() {
      if (this.running || this.left === 0) return
      this.running = true
      id = setInterval(() => {
        timer.left--
        if (timer.left === 0) timer.stop()
      }, 1000)
    },
    stop() { clearInterval(id); this.running = false },
    reset() { this.stop(); this.left = seconds },
  })
  let id = null
  Kreftjs.onDestroy(() => clearInterval(id))
  return timer
}
