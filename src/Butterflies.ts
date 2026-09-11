import * as THREE from "three";

/** Static instance data; the GPU animates flight and wings in one draw. */
export class Butterflies {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly time = { value: 0 };
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(grassGeometry: THREE.BufferGeometry, count = 48) {
    const homes = grassGeometry.getAttribute("aOffset");
    const total = homes?.count ? Math.max(0, Math.floor(count)) : 0;
    const vertices: number[] = [];
    const parts: number[] = [];
    const triangle = (a: number[], b: number[], c: number[], wing: number) => {
      vertices.push(...a, ...b, ...c);
      parts.push(wing, wing, wing);
    };
    // Two scalloped, low-poly wings joined along the body's Z axis.
    const outline = [[0, -0.17], [0.23, -0.32], [0.39, -0.23],
      [0.36, -0.03], [0.21, 0.03], [0.28, 0.19], [0.15, 0.29], [0, 0.14]];
    for (const side of [-1, 1]) {
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
        triangle([0, 0, 0], [side * a[0]!, 0, a[1]!], [side * b[0]!, 0, b[1]!], 1);
      }
    }
    triangle([-0.023, 0.012, -0.24], [0.023, 0.012, -0.24], [0.023, 0.012, 0.23], 0);
    triangle([-0.023, 0.012, -0.24], [0.023, 0.012, 0.23], [-0.023, 0.012, 0.23], 0);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("aWing", new THREE.Float32BufferAttribute(parts, 1));
    const offsets = new Float32Array(total * 3);
    const seeds = new Float32Array(total * 4);
    const colors = new Float32Array(total * 3);
    const palette = [0xffce80, 0xeab2c5, 0xb8bae9, 0xffedc3].map((hex) => new THREE.Color(hex));
    const bounds = new THREE.Box3();
    let seed = 73819;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < total; i++) {
      const source = Math.floor(random() * homes.count);
      const x = homes.getX(source), z = homes.getY(source);
      const y = 1.4 + random() * 1.6;
      offsets.set([x, y, z], i * 3);
      seeds.set([random(), random(), random(), random()], i * 4);
      palette[Math.floor(random() * palette.length)]!.toArray(colors, i * 3);
      bounds.expandByPoint(new THREE.Vector3(x, y, z));
    }
    geometry.setAttribute("aHome", new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(colors, 3));
    geometry.instanceCount = total;
    if (total) {
      bounds.expandByScalar(3); // Includes the flight orbit and full wingspan.
      geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    }
    const material = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: this.time },
      vertexShader, fragmentShader, side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.visible = total > 0;
  }

  update(dt: number): void {
    if (!this.reducedMotion) this.time.value += Math.max(0, Math.min(dt, 0.1));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime;
  attribute float aWing;
  attribute vec3 aHome;
  attribute vec4 aSeed;
  attribute vec3 aTint;
  varying vec3 vTint;
  varying float vWing;
  varying float vEdge;
  void main() {
    float phase = aSeed.x * 6.283185*2.;
    float speed = 1.5 + aSeed.y * 0.25;
    float orbit = uTime * speed + phase;
    float flap = sin(uTime * (15.0 + aSeed.z * 9.0) + phase) * 0.95;
    vec3 p = position;
    p.x = position.x * cos(flap);
    p.y += abs(position.x) * sin(flap) * aWing;
    p *= 0.65 + aSeed.w * 0.45;
    // Face along the flight orbit, rather than toward the camera.
    float yaw = -orbit;
    p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
    p += aHome + vec3(cos(orbit) * 1.4,
      sin(orbit * 2.0 + phase) * 0.25, sin(orbit) * 1.4);
    vTint = aTint;
    vWing = aWing;
    vEdge = abs(position.x) / 0.39;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec3 vTint;
  varying float vWing;
  varying float vEdge;
  void main() {
    vec3 wing = vTint * mix(0.65, 1.0, smoothstep(0.0, 0.35, vEdge));
    wing *= 1.0 - smoothstep(0.75, 1.0, vEdge) * 0.32;
    gl_FragColor = vec4(mix(vec3(0.10, 0.065, 0.045), wing, vWing), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;