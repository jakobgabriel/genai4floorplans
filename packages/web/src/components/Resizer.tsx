import { useRef } from "react";

// A thin draggable divider for resizing a sidebar. `edge` is which side of the
// sidebar the handle sits on: "right" (handle right of a LEFT sidebar — drag
// right to widen) or "left" (handle left of a RIGHT sidebar — drag left to widen).
export function Resizer({
  width,
  setWidth,
  edge,
  min = 200,
  max = 640,
}: {
  width: number;
  setWidth: (w: number) => void;
  edge: "left" | "right";
  min?: number;
  max?: number;
}) {
  const start = useRef({ x: 0, w: 0 });

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    start.current = { x: e.clientX, w: width };
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - start.current.x;
      const next = edge === "right" ? start.current.w + delta : start.current.w - delta;
      setWidth(Math.max(min, Math.min(max, Math.round(next))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setWidth(edge === "right" ? 300 : 360)}
    />
  );
}
