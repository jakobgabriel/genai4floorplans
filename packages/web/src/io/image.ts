import { triggerDownload } from "./download";

const BG = "#141d20";

/** Grab the live layout SVG (e.g. label "ACTUAL") and return standalone markup. */
export function serializeLayout(label: string): { svg: string; width: number; height: number } | null {
  const el = document.querySelector(`svg[data-layout="${label}"]`) as SVGSVGElement | null;
  if (!el) return null;
  const clone = el.cloneNode(true) as SVGSVGElement;
  const vb = (el.getAttribute("viewBox") || "0 0 800 500").split(/\s+/).map(Number);
  const width = vb[2] || el.clientWidth || 800;
  const height = vb[3] || el.clientHeight || 500;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.background = BG;
  // explicit background rect so exported/printed images aren't transparent
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(vb[0] || 0));
  bg.setAttribute("y", String(vb[1] || 0));
  bg.setAttribute("width", String(width));
  bg.setAttribute("height", String(height));
  bg.setAttribute("fill", BG);
  clone.insertBefore(bg, clone.firstChild);
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export function downloadLayoutSVG(label: string, name: string): boolean {
  const out = serializeLayout(label);
  if (!out) return false;
  triggerDownload(new Blob([out.svg], { type: "image/svg+xml" }), name + ".svg");
  return true;
}

export async function downloadLayoutPNG(label: string, name: string, scale = 2): Promise<boolean> {
  const out = serializeLayout(label);
  if (!out) return false;
  const blob = await svgToPngBlob(out.svg, out.width, out.height, scale);
  triggerDownload(blob, name + ".png");
  return true;
}

export function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}
