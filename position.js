// Where the island sits on screen: top-centre by default, or wherever the user dragged it.
// pos = { x, y, up }: x = centre of the pill, y = its top edge (or its bottom edge when up is true,
// which makes the island open upwards, used near the bottom of a screen).
module.exports = function makePosition({ screen, getS, W, H }) {
  const PILL_H = 28, OPEN_H = 340;
  const zoom = () => ({ compact: .88, large: 1.15 }[(getS().island || {}).size] || 1);
  const clampN = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));

  // the window rectangle that puts the pill where the saved position says
  function target() {
    const I = getS().island || {}, p = I.pos;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
      const b = screen.getPrimaryDisplay().bounds;
      return { x: Math.round(b.x + b.width / 2 - W / 2), y: b.y, free: false, up: false, attached: false };
    }
    const d = screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) }), b = d.bounds, wa = d.workArea, half = 210 * zoom() + 8;
    const x = clampN(p.x, b.x + half, b.x + b.width - half), up = !!p.up;
    const y = up ? clampN(p.y, wa.y + 30, wa.y + wa.height) : clampN(p.y, b.y, wa.y + wa.height - 30);
    const attached = !up && y <= b.y + 2 && I.style !== 'float';   // touching the top edge: keeps the notch look
    return { x: Math.round(x - W / 2), y: Math.round(attached ? y : up ? y + 10 - H : y - 10), free: true, up, attached };
  }

  // after a drag: keep it on screen, snap to the middle / top edge, open upwards if there is no room below
  function finalize(cx, top) {
    const d = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(top) }), b = d.bounds, wa = d.workArea;
    const z = zoom(), ph = PILL_H * z, half = 210 * z + 8;
    let x = clampN(cx, b.x + half, b.x + b.width - half);
    if (Math.abs(x - (b.x + b.width / 2)) < 14) x = b.x + b.width / 2;
    let y = clampN(top, b.y, wa.y + wa.height - ph - 4);
    const below = wa.y + wa.height - y, above = y + ph - wa.y;
    if (below < OPEN_H * z + 12 && above > below) return { x: Math.round(x), y: Math.round(y + ph), up: true };
    if (y < b.y + 22) y = b.y;   // close to the top edge: attach to it
    return { x: Math.round(x), y: Math.round(y), up: false };
  }

  // where the pill is right now (centre x, anchored edge y, up)
  function current() {
    const t = target();
    return { x: t.x + W / 2, y: t.up ? t.y + H - 10 : (t.attached || !t.free ? t.y : t.y + 10), up: t.up };
  }
  return { target, finalize, current, zoom, PILL_H };
};