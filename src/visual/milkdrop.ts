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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / max(u_resolution.y, 1.0);
  float t = u_time * u_motion;

  float radius = length(p);
  float angle = atan(p.y, p.x);
  float warp = angle + t * 0.14 + radius * 1.6;
  vec2 swirl = vec2(radius * cos(warp), radius * sin(warp));

  float plasma = sin(swirl.x * 3.1 + t * 0.42)
    + sin(swirl.y * 4.2 - t * 0.33)
    + sin((swirl.x + swirl.y) * 2.4 + t * 0.21);
  plasma = plasma * 0.33 + 0.5;

  float fractal = fbm(swirl * 2.15 + vec2(t * 0.06, -t * 0.05), u_octaves);
  float mist = fbm(p * 1.15 + vec2(-t * 0.04, t * 0.03), max(u_octaves - 1.0, 1.0));

  float orbs = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 center = vec2(
      sin(t * 0.21 + fi * 2.15),
      cos(t * 0.17 + fi * 1.73)
    ) * 0.58;
    float d = length(p - center);
    orbs += smoothstep(0.42, 0.08, d) * 0.48;
    orbs += smoothstep(0.045, 0.0, abs(d - 0.3)) * 0.28;
  }

  vec3 deep = vec3(0.015, 0.07, 0.13);
  vec3 aqua = vec3(0.22, 0.72, 0.9);
  vec3 sky = vec3(0.55, 0.88, 1.0);
  vec3 lime = vec3(0.42, 0.95, 0.58);
  vec3 col = mix(deep, aqua, clamp(plasma, 0.0, 1.0));
  col = mix(col, sky, fractal * 0.55);
  col = mix(col, lime, orbs * 0.32 + mist * 0.14);

  float vig = smoothstep(1.2, 0.18, radius);
  col *= 0.42 + 0.58 * vig;
  // Keep the centre a little darker so HUD type stays readable.
  col *= 0.88 + 0.12 * smoothstep(0.0, 0.55, uv.y);
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
  }
  private scale = 1
  private octaves = 5
  private motion = 1
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
