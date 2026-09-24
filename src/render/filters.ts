/**
 * Hand-rolled dual-backend (GLSL + WGSL) fullscreen filters.
 * pixi-filters 6.1.5 blacks out on Pixi v8's WebGPU renderer, so the two
 * effects we need are implemented directly against the v8 Filter API,
 * following the shader conventions of pixi's built-in filters.
 */
import { Filter, GlProgram, GpuProgram, UniformGroup } from 'pixi.js';

const globalWgslPreamble = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>,
};

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>,
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition),
  );
}
`;

// ---------------------------------------------------------------- bloom ---

const glowWgsl = `
${globalWgslPreamble}
struct GlowUniforms {
  uGlow:vec4<f32>, // x threshold, y strength, zw unused
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> glowUniforms : GlowUniforms;

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let t = gfu.uInputSize.zw;
  var sum = vec3<f32>(0.0);
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-t.x, -t.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(0.0, -t.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(t.x, -t.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-t.x, 0.0)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(t.x, 0.0)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-t.x, t.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(0.0, t.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(t.x, t.y)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(-t.x * 2.0, 0.0)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(t.x * 2.0, 0.0)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(0.0, -t.y * 2.0)).rgb;
  sum += textureSample(uTexture, uSampler, uv + vec2<f32>(0.0, t.y * 2.0)).rgb;
  sum = sum / 12.0;
  let thr = vec3<f32>(glowUniforms.uGlow.x);
  let glow = max(vec3<f32>(0.0), sum - thr) * glowUniforms.uGlow.y;
  let c = textureSample(uTexture, uSampler, uv);
  return vec4<f32>(c.rgb + glow, c.a);
}`;

const glowFrag = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uGlow; // x threshold, y strength, zw unused

void main(void) {
    vec2 t = vec2(1.0) / uInputSize.xy;
    vec3 sum = vec3(0.0);
    sum += texture(uTexture, vTextureCoord + vec2(-t.x, -t.y)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(0.0, -t.y)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(t.x, -t.y)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(-t.x, 0.0)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(t.x, 0.0)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(-t.x, t.y)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(0.0, t.y)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(t.x, t.y)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(-t.x * 2.0, 0.0)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(t.x * 2.0, 0.0)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(0.0, -t.y * 2.0)).rgb;
    sum += texture(uTexture, vTextureCoord + vec2(0.0, t.y * 2.0)).rgb;
    sum /= 12.0;
    vec3 glow = max(vec3(0.0), sum - vec3(uGlow.x)) * uGlow.y;
    vec4 c = texture(uTexture, vTextureCoord);
    finalColor = vec4(c.rgb + glow, c.a);
}`;

export class GlowFilter extends Filter {
  constructor(options: { threshold?: number; strength?: number } = {}) {
    const gpuProgram = GpuProgram.from({
      vertex: { source: glowWgsl, entryPoint: 'mainVertex' },
      fragment: { source: glowWgsl, entryPoint: 'mainFragment' },
    });
    const glProgram = GlProgram.from({
      vertex: defaultVert,
      fragment: glowFrag,
      name: 'glow-filter',
    });
    super({
      gpuProgram,
      glProgram,
      resources: {
        glowUniforms: new UniformGroup({
          uGlow: { value: new Float32Array([options.threshold ?? 0.55, options.strength ?? 0.9, 0, 0]), type: 'vec4<f32>' },
        }),
      },
    });
  }

  set threshold(v: number) { this.resources.glowUniforms.uniforms.uGlow[0] = v; }
  set strength(v: number) { this.resources.glowUniforms.uniforms.uGlow[1] = v; }
}

// ------------------------------------------------------------ chromatic ---

const chromaticWgsl = `
${globalWgslPreamble}
struct ChromaticUniforms {
  uSplit:vec4<f32>, // xy red uv offset, zw blue uv offset
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> chromaticUniforms : ChromaticUniforms;

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
) -> @location(0) vec4<f32> {
  let r = textureSample(uTexture, uSampler, uv + chromaticUniforms.uSplit.xy).r;
  let c = textureSample(uTexture, uSampler, uv);
  let b = textureSample(uTexture, uSampler, uv + chromaticUniforms.uSplit.zw).b;
  return vec4<f32>(r, c.g, b, c.a);
}`;

const chromaticFrag = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uSplit; // xy red uv offset, zw blue uv offset

void main(void) {
    float r = texture(uTexture, vTextureCoord + uSplit.xy).r;
    vec4 c = texture(uTexture, vTextureCoord);
    float b = texture(uTexture, vTextureCoord + uSplit.zw).b;
    finalColor = vec4(r, c.g, b, c.a);
}`;

const defaultVert = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

export class ChromaticFilter extends Filter {
  constructor() {
    const gpuProgram = GpuProgram.from({
      vertex: { source: chromaticWgsl, entryPoint: 'mainVertex' },
      fragment: { source: chromaticWgsl, entryPoint: 'mainFragment' },
    });
    const glProgram = GlProgram.from({
      vertex: defaultVert,
      fragment: chromaticFrag,
      name: 'chromatic-filter',
    });
    super({
      gpuProgram,
      glProgram,
      resources: {
        chromaticUniforms: new UniformGroup({
          uSplit: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
        }),
      },
    });
  }

  /** set red/blue uv offsets (tiny values, e.g. 0.004) */
  set split(v: [number, number, number, number]) {
    const u = this.resources.chromaticUniforms.uniforms.uSplit;
    u[0] = v[0];
    u[1] = v[1];
    u[2] = v[2];
    u[3] = v[3];
  }
}
