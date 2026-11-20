"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * PROTOTYPE. One photograph taken at ground level, shown under the terrain view.
 * A 360-degree photo is drawn on a canvas you can look around in; a flat photo
 * is an ordinary picture. Nothing here is drawn by this Site: every pixel is
 * the photographer's. See scripts/terrain_prototype/fetch_ground_photos.py.
 *
 * A 360-degree photo is stored as one wide picture (longitude across, latitude
 * down). The canvas works out, for each of its pixels, which way that pixel
 * looks and reads the picture there. No library is involved.
 */

export type GroundPhotoEntry = Readonly<{
  id: string;
  archive: string;
  kind: "sphere" | "flat";
  lon: number;
  lat: number;
  heading: number | null;
  taken: string;
  by: string;
  licence: string;
  /** The same photo at one or more widths, narrowest first. */
  files: readonly Readonly<{ href: string; width: number; height: number }>[];
}>;

export type GroundPhotoText = Readonly<{
  groundLabel: string; groundPosition: string; groundTaken: string; groundSphere: string; groundFlat: string; groundLoading: string;
  groundFailed: string; groundPrevious: string; groundNext: string; groundClose: string; groundLeft: string; groundRight: string;
  groundUp: string; groundDown: string; groundCloser: string; groundWider: string; groundLicence: string;
}>;

const VERTEX = `#version 300 es
in vec2 corner;
out vec2 at;
void main() { at = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

// "look" is how far the view is turned and raised, in radians; "lens" is the
// tangent of half the field of view, across and up. The picture wraps at the
// back, where its left and right edges meet, so the place to read is worked out
// twice, with the join in two different spots, and the smooth one is used.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D photo;
uniform vec2 look;
uniform vec2 lens;
in vec2 at;
out vec4 colour;
void main() {
  vec3 d = normalize(vec3(at * lens, -1.0));
  float cp = cos(look.y), sp = sin(look.y), cy = cos(look.x), sy = sin(look.x);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  d = vec3(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
  float v = 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.14159265;
  float u = atan(d.x, -d.z) / 6.2831853 + 0.5;
  float w = fract(u + 0.5) - 0.5;
  vec2 a = vec2(u, v), b = vec2(w, v);
  vec2 ax = dFdx(a), ay = dFdy(a), bx = dFdx(b), by = dFdy(b);
  bool first = fwidth(u) <= fwidth(w);
  colour = textureGrad(photo, first ? a : b, first ? ax : bx, first ? ay : by);
}`;

const START = { yaw: 0, pitch: 0, fov: 80 };
const FOV_MIN = 12;
const FOV_MAX = 100;
const PITCH_MAX = 85;
const TURN_STEP = 30;
const NARROW_SCREEN_WIDEST = 4096;

type State = "loading" | "ready" | "failed";

export function GroundPhoto({ photo, base, position, text, onPrevious, onNext, onClose }: Readonly<{
  photo: GroundPhotoEntry;
  /** The folder the photo's files are in, ending with a slash. */
  base: string;
  position: Readonly<{ index: number; count: number }>;
  text: GroundPhotoText;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ ...START });
  const redraw = useRef<() => void>(() => {});
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [state, setState] = useState<State>("loading");
  const sphere = photo.kind === "sphere";

  useEffect(() => {
    if (!sphere) return;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", { alpha: false, antialias: false });
    if (!canvas || !gl) {
      setState("failed");
      return;
    }
    let active = true;
    let frame = 0;
    // Moving to another photo stops this one's download; the widest copy is tens of megabytes.
    const stop = new AbortController();
    const shader = (type: number, source: string) => {
      const made = gl.createShader(type);
      if (!made) throw new Error("no shader");
      gl.shaderSource(made, source);
      gl.compileShader(made);
      return made;
    };
    const program = gl.createProgram();
    const texture = gl.createTexture();
    const corners = gl.createBuffer();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setState("failed");
      return;
    }
    gl.useProgram(program);
    // One triangle that covers the whole canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    const look = gl.getUniformLocation(program, "look");
    const lens = gl.getUniformLocation(program, "lens");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let drawn = false;
    const draw = () => {
      if (!drawn) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      const half = Math.tan((view.current.fov * Math.PI) / 360);
      gl.uniform2f(lens, (half * width) / height, half);
      gl.uniform2f(look, (view.current.yaw * Math.PI) / 180, (view.current.pitch * Math.PI) / 180);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    redraw.current = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    // The narrowest copy first, so there is something to look at quickly, then the widest this device can hold.
    const widest = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, window.matchMedia("(max-width: 767px)").matches ? NARROW_SCREEN_WIDEST : Infinity);
    const fits = photo.files.filter((file) => file.width <= widest);
    const order = fits.length > 1 ? [fits[0], fits[fits.length - 1]] : [fits[0] ?? photo.files[0]];
    const load = async () => {
      for (const file of order) {
        try {
          const response = await fetch(base + file.href, { signal: stop.signal });
          if (!response.ok) throw new Error(String(response.status));
          const picture = await createImageBitmap(await response.blob());
          if (!active) return picture.close();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, picture);
          gl.generateMipmap(gl.TEXTURE_2D);
          picture.close();
          drawn = true;
          setState("ready");
          redraw.current();
        } catch {
          // A wider copy that would not load leaves the narrower one on screen.
          if (active && !drawn) setState("failed");
          return;
        }
      }
    };
    void load();
    const observer = new ResizeObserver(() => redraw.current());
    observer.observe(canvas);
    return () => {
      active = false;
      stop.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      redraw.current = () => {};
      gl.deleteTexture(texture);
      gl.deleteBuffer(corners);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [photo, base, sphere]);

  const turn = (yaw: number, pitch: number) => {
    view.current.yaw = (view.current.yaw + yaw) % 360;
    view.current.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, view.current.pitch + pitch));
    redraw.current();
  };
  const magnify = (factor: number) => {
    view.current.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, view.current.fov * factor));
    redraw.current();
  };
  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    // The picture follows the pointer: dragging it right looks left.
    const perPixel = view.current.fov / Math.max(1, event.currentTarget.clientHeight);
    turn(-(event.clientX - drag.current.x) * perPixel, (event.clientY - drag.current.y) * perPixel);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const up = () => {
    drag.current = null;
  };

  const flat = photo.files[photo.files.length - 1];
  const taken = text.groundTaken.replace("{date}", photo.taken).replace("{by}", photo.by).replace("{archive}", photo.archive);
  return (
    <div className="place-ground" role="group" aria-label={text.groundLabel}>
      <div className="place-ground-view" data-state={state}>
        {sphere ? (
          <canvas ref={canvasRef} role="img" aria-label={text.groundLabel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        ) : (
          // A plain picture from this Site's own folder; next/image would add a resizing service the prototype does not need.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={base + flat.href} width={flat.width} height={flat.height} alt={text.groundLabel} onLoad={() => setState("ready")} onError={() => setState("failed")} />
        )}
        {state === "ready" ? null : <span className="place-ground-status" role="status">{state === "failed" ? text.groundFailed : text.groundLoading}</span>}
      </div>
      <div className="place-terrain-controls">
        <button type="button" className="btn btn--outline" onClick={onPrevious}>{text.groundPrevious}</button>
        <button type="button" className="btn btn--outline" onClick={onNext}>{text.groundNext}</button>
        {sphere ? (
          <>
            <button type="button" className="btn btn--outline" onClick={() => turn(-TURN_STEP, 0)}>{text.groundLeft}</button>
            <button type="button" className="btn btn--outline" onClick={() => turn(TURN_STEP, 0)}>{text.groundRight}</button>
            <button type="button" className="btn btn--outline" onClick={() => turn(0, TURN_STEP / 2)}>{text.groundUp}</button>
            <button type="button" className="btn btn--outline" onClick={() => turn(0, -TURN_STEP / 2)}>{text.groundDown}</button>
            <button type="button" className="btn btn--outline" onClick={() => magnify(0.6)}>{text.groundCloser}</button>
            <button type="button" className="btn btn--outline" onClick={() => magnify(1 / 0.6)}>{text.groundWider}</button>
          </>
        ) : null}
        <button type="button" className="btn btn--outline" onClick={onClose}>{text.groundClose}</button>
      </div>
      <p className="place-ground-credit">
        <span>{text.groundPosition.replace("{n}", String(position.index + 1)).replace("{count}", String(position.count))}</span>
        <span>{taken}</span>
        <span>{sphere ? text.groundSphere : text.groundFlat}</span>
        <span>{text.groundLicence}</span>
      </p>
    </div>
  );
}
