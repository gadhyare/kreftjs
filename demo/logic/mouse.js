// A piece of shared logic (a "composable"): any component can use it with
//   use mouse = trackMouse()
// It uses Kreft's own functions, and cleans up after itself when the component goes away.
export function trackMouse() {
  const pos = Kreft.state({ x: 0, y: 0, moves: 0 })
  const move = (e) => {
    pos.x = e.clientX
    pos.y = e.clientY
    pos.moves++
  }
  window.addEventListener('pointermove', move)
  Kreft.onDestroy(() => window.removeEventListener('pointermove', move))
  return pos
}
