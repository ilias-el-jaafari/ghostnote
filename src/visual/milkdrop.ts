/** WebGL MilkDrop-style background renderer. No React. */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
#ifdef GL_ES
precision highp float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_octaves;
uniform float u_motion;
uniform float u_mode;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, float octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    value += amplitude * noise(p);
    p *= 2.07;
    amplitude *= 0.5;
  }
  return value;
}

vec2 kaleido(vec2 p, float segments) {
  float a = atan(p.y, p.x);
  float r = length(p);
  float slice = 6.2831853 / segments;
  a = mod(a, slice);
  a = abs(a - slice * 0.5);
  return vec2(cos(a), sin(a)) * r;
}

vec3 kaleidoTheme(vec2 p, vec2 uv, float t, float octaves) {
  vec2 k = kaleido(p * (1.0 + 0.15 * sin(t * 0.3)), 8.0);
  float plasma = sin(k.x * 10.0 + t * 1.1) + sin(k.y * 12.0 - t * 0.85) + sin((k.x + k.y) * 8.0 + t);
  plasma = plasma * 0.33 + 0.5;
  float rings = 0.5 + 0.5 * sin(length(k) * 16.0 - t * 1.4);
  float frac = fbm(k * 3.6 + vec2(t * 0.16, -t * 0.12), octaves);
  float poly = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * 0.25 + fi * 1.7), cos(t * 0.22 + fi * 2.1)) * 0.55;
    vec2 d = abs(k - c);
    float tri = max(d.x * 0.866 + d.y * 0.5, d.y);
    poly += smoothstep(0.28, 0.04, tri) * 0.55;
  }
  vec3 mag = vec3(1.0, 0.08, 0.9);
  vec3 cyn = vec3(0.0, 1.0, 1.0);
  vec3 lim = vec3(0.4, 1.0, 0.12);
  vec3 pur = vec3(0.42, 0.0, 1.0);
  vec3 col = mix(pur, cyn, plasma);
  col = mix(col, mag, rings * 0.65);
  col = mix(col, lim, poly + frac * 0.25);
  col = mix(col, vec3(1.0, 0.95, 0.25), smoothstep(0.7, 1.0, frac) * 0.55);
  col = mix(col, col * col * 1.15, 0.35);
  return col;
}

vec3 aquaTheme(vec2 p, vec2 uv, float t, float octaves) {
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float warp = angle + t * 0.2 + radius * 1.8;
  vec2 swirl = vec2(radius * cos(warp), radius * sin(warp));
  float plasma = sin(swirl.x * 3.4 + t * 0.5) + sin(swirl.y * 4.6 - t * 0.4) + sin((swirl.x + swirl.y) * 2.6 + t * 0.3);
  plasma = plasma * 0.33 + 0.5;
  float frac = fbm(swirl * 2.2 + vec2(t * 0.08, -t * 0.06), octaves);
  float orbs = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * 0.23 + fi * 2.0), cos(t * 0.19 + fi * 1.6)) * 0.62;
    float d = length(p - c);
    orbs += smoothstep(0.36, 0.05, d) * 0.55;
    orbs += smoothstep(0.04, 0.0, abs(d - 0.22)) * 0.5;
  }
  vec3 deep = vec3(0.0, 0.12, 0.28);
  vec3 aqua = vec3(0.1, 0.85, 1.0);
  vec3 hot = vec3(1.0, 0.45, 0.85);
  vec3 lime = vec3(0.4, 1.0, 0.7);
  vec3 col = mix(deep, aqua, clamp(plasma + 0.15, 0.0, 1.0));
  col = mix(col, vec3(0.7, 0.95, 1.0), frac * 0.5);
  col = mix(col, hot, orbs * 0.28);
  col = mix(col, lime, orbs * 0.2 * (0.5 + 0.5 * sin(t + radius * 6.0)));
  col += vec3(0.8, 0.95, 1.0) * smoothstep(0.12, 0.0, radius) * 0.35;
  return col;
}

vec3 galaxyTheme(vec2 p, vec2 uv, float t, float octaves) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float arm = 0.5 + 0.5 * sin(a * 3.0 + r * 7.0 - t * 0.6);
  float neb = fbm(p * 2.0 + vec2(t * 0.05, -t * 0.04), octaves);
  vec3 deep = vec3(0.02, 0.0, 0.08);
  vec3 armA = vec3(0.15, 0.45, 1.0);
  vec3 armB = vec3(1.0, 0.25, 0.85);
  vec3 col = mix(deep, mix(armA, armB, arm), neb * (0.4 + 0.6 * arm) * exp(-r * 0.7));
  // Starfield
  float stars = step(0.996, hash(floor(p * 90.0 + 12.0)));
  stars += step(0.993, hash(floor(p * 160.0))) * 0.6;
  col += vec3(0.9, 0.95, 1.0) * stars;
  // Spiral core
  col += vec3(1.0, 0.85, 0.7) * exp(-r * 6.0) * 0.8;
  return col;
}

vec3 laserTheme(vec2 p, vec2 uv, float t, float octaves) {
  vec2 q = p;
  q.y += 0.22;
  float depth = q.y + 0.55;
  vec2 grid = vec2(q.x / max(depth, 0.08), 1.6 / max(depth, 0.08) - t * 0.9);
  float gx = abs(fract(grid.x * 6.0) - 0.5);
  float gy = abs(fract(grid.y * 6.0) - 0.5);
  float line = smoothstep(0.07, 0.0, gx) + smoothstep(0.07, 0.0, gy);
  line *= smoothstep(-0.15, 0.05, q.y);
  float beam = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = tan(fi * 1.1 + t * 0.15) * 0.15;
    beam += smoothstep(0.04, 0.0, abs(p.x - x)) * (0.4 + 0.6 * sin(t * 3.0 + fi));
  }
  float haze = fbm(p * 1.8 + vec2(0.0, -t * 0.2), max(octaves - 1.0, 1.0));
  vec3 col = vec3(0.04, 0.0, 0.1);
  col += vec3(0.1, 1.0, 1.0) * line * 0.85;
  col += vec3(1.0, 0.1, 0.95) * beam * 0.55;
  col += vec3(0.6, 0.0, 1.0) * haze * 0.25;
  col += vec3(0.0, 1.0, 0.6) * exp(-abs(p.x) * 4.0) * 0.12;
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / max(u_resolution.y, 1.0);
  float t = u_time * u_motion;

  vec3 col;
  if (u_mode < 0.5) col = kaleidoTheme(p, uv, t, u_octaves);
  else if (u_mode < 1.5) col = aquaTheme(p, uv, t, u_octaves);
  else if (u_mode < 2.5) col = galaxyTheme(p, uv, t, u_octaves);
  else col = laserTheme(p, uv, t, u_octaves);

  float radius = length(p);
  float vig = smoothstep(1.25, 0.2, radius);
  col *= 0.55 + 0.45 * vig;
  // Slightly darken the middle so HUD type stays readable on busy presets.
  col *= 0.82 + 0.18 * smoothstep(0.0, 0.6, uv.y);
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'shader compile failed'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

export type MilkdropOptions = {
  scale?: number
  octaves?: number
  motion?: number
  mode?: number
}

export class MilkdropRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | undefined
  private program: WebGLProgram | undefined
  private buffer: WebGLBuffer | undefined
  private uniforms = {
    time: null as WebGLUniformLocation | null,
    resolution: null as WebGLUniformLocation | null,
    octaves: null as WebGLUniformLocation | null,
    motion: null as WebGLUniformLocation | null,
    mode: null as WebGLUniformLocation | null,
  }
  private scale = 1
  private octaves = 5
  private motion = 1
  private mode = 1
  private start = performance.now()
  private frozenTime = 0
  private failed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) {
      this.failed = true
      return
    }
    this.gl = gl
    try {
      const vert = compile(gl, gl.VERTEX_SHADER, VERT)
      const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
      const program = gl.createProgram()
      if (!program) throw new Error('Could not create program')
      gl.attachShader(program, vert)
      gl.attachShader(program, frag)
      gl.bindAttribLocation(program, 0, 'a_pos')
      gl.linkProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'link failed')
      }
      this.program = program
      this.uniforms.time = gl.getUniformLocation(program, 'u_time')
      this.uniforms.resolution = gl.getUniformLocation(program, 'u_resolution')
      this.uniforms.octaves = gl.getUniformLocation(program, 'u_octaves')
      this.uniforms.motion = gl.getUniformLocation(program, 'u_motion')
      this.uniforms.mode = gl.getUniformLocation(program, 'u_mode')
      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      this.buffer = buffer
    } catch {
      this.failed = true
      this.destroy()
    }
  }

  get ok(): boolean {
    return Boolean(this.gl && this.program && !this.failed)
  }

  configure(options: MilkdropOptions) {
    if (options.scale !== undefined) this.scale = options.scale
    if (options.octaves !== undefined) this.octaves = options.octaves
    if (options.motion !== undefined) this.motion = options.motion
    if (options.mode !== undefined) this.mode = options.mode
  }

  resize() {
    if (!this.gl) return
    const ratio = Math.min(window.devicePixelRatio || 1, this.scale >= 1 ? 2 : 1)
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio * this.scale))
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio * this.scale))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  render(now = performance.now()) {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return
    this.resize()
    if (this.motion > 0) this.frozenTime = (now - this.start) / 1000
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer ?? null)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1f(this.uniforms.time, this.frozenTime)
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.uniforms.octaves, this.octaves)
    gl.uniform1f(this.uniforms.motion, this.motion > 0 ? 1 : 0)
    gl.uniform1f(this.uniforms.mode, this.mode)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  destroy() {
    const gl = this.gl
    if (gl) {
      if (this.buffer) gl.deleteBuffer(this.buffer)
      if (this.program) gl.deleteProgram(this.program)
    }
    this.buffer = undefined
    this.program = undefined
    this.gl = undefined
  }
}
