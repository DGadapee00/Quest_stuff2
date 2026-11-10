import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import type { MaterialId, TankDesign } from "../types.js";
import { assertNever } from "../types.js";
import { FORMING_SECONDS, formingFrame } from "./forming.js";
import type { FormingPhase } from "./forming.js";
import type { Heatmap } from "./stand.js";

const TAU = Math.PI * 2;

export class TankViewport {
  private readonly renderer: WebGLRenderer | null;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly tank = new Group();
  private readonly cradle = new Group();
  private readonly shell: MeshStandardMaterial;
  private readonly apex: MeshStandardMaterial;
  private readonly knuckle: MeshStandardMaterial;
  private readonly seam: MeshStandardMaterial;
  private readonly girth: MeshStandardMaterial;
  private readonly bead: MeshStandardMaterial;
  private readonly plies: MeshStandardMaterial[];
  private readonly saddle: MeshStandardMaterial;
  private readonly weldLight: PointLight;
  private readonly look = new Vector3();
  private readonly geometries: BufferGeometry[] = [];
  private design: TankDesign | null = null;
  private playing = false;
  private elapsed = 0;
  private lastStamp = 0;
  private yaw = 0.55;
  private pitch = 0.32;
  private distance = 4.2;
  private fittedSpan = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastPhase: FormingPhase | null = null;
  private frameId = 0;
  private heatmap: Heatmap | null = null;
  private formScaleX = 1;
  private radialScale = 1;
  private axialScale = 1;
  private readonly reduceMotion: boolean;
  private readonly onPhase: (phase: FormingPhase) => void;

  constructor(host: HTMLElement, onPhase: (phase: FormingPhase) => void) {
    this.onPhase = onPhase;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = new PerspectiveCamera(32, 1, 0.05, 80);
    this.shell = new MeshStandardMaterial({ color: 0xc5ccd1, metalness: 0.86, roughness: 0.34, side: DoubleSide });
    this.apex = new MeshStandardMaterial({ color: 0xc5ccd1, metalness: 0.86, roughness: 0.34, side: DoubleSide });
    this.knuckle = new MeshStandardMaterial({ color: 0xc5ccd1, metalness: 0.86, roughness: 0.34, side: DoubleSide });
    this.seam = new MeshStandardMaterial({ color: 0x8d5a3c, metalness: 0.65, roughness: 0.42 });
    this.girth = new MeshStandardMaterial({ color: 0x8d5a3c, metalness: 0.65, roughness: 0.42 });
    this.bead = new MeshStandardMaterial({ color: 0xd7ecff, emissive: 0x9fd4ff, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.25 });
    this.plies = [0xd8a15a, 0x8a9294, 0x6e8ea6, 0xc46a3a].map(
      (color) =>
        new MeshStandardMaterial({
          color,
          metalness: 0.05,
          roughness: 0.55,
          transparent: true,
          opacity: 0.4,
          side: DoubleSide,
        }),
    );
    this.saddle = new MeshStandardMaterial({ color: 0x3a342c, metalness: 0.4, roughness: 0.7 });
    this.weldLight = new PointLight(0xd0ecff, 0, 1.4, 2);
    this.scene.add(this.weldLight);

    let renderer: WebGLRenderer | null = null;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x141311, 1);
      host.appendChild(renderer.domElement);
    } catch {
      renderer = null;
      const note = document.createElement("p");
      note.className = "webgl-fallback";
      note.textContent = "This bay needs WebGL. The traveler still has the numbers.";
      host.appendChild(note);
    }
    this.renderer = renderer;

    this.scene.background = new Color(0x141311);
    this.scene.add(new AmbientLight(0x8a8074, 0.55));
    const key = new DirectionalLight(0xffe2c4, 2.6);
    key.position.set(3.5, 6.5, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0x89a6c4, 1.15);
    rim.position.set(-5, 2.5, -3.5);
    this.scene.add(rim);
    this.scene.add(this.tank);
    this.scene.add(this.cradle);
    this.addBay();

    if (renderer) {
      const canvas = renderer.domElement;
      canvas.setAttribute("aria-label", "Three-dimensional view of the propellant tank.");
      canvas.addEventListener("pointerdown", this.onPointerDown);
      canvas.addEventListener("pointermove", this.onPointerMove);
      canvas.addEventListener("pointerup", this.onPointerUp);
      canvas.addEventListener("pointercancel", this.onPointerUp);
      canvas.addEventListener("wheel", this.onWheel, { passive: false });
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(host);
      this.resize();
    }
    this.frameId = requestAnimationFrame(this.tick);
  }

  setDesign(design: TankDesign | null): void {
    this.design = design;
    this.playing = false;
    this.lastPhase = null;
    if (!design) {
      this.clearTank();
      this.weldLight.intensity = 0;
      return;
    }
    this.fit(design);
    this.draw(design, 1, false);
  }

  setHeatmap(heatmap: Heatmap | null): void {
    this.heatmap = heatmap;
    if (heatmap) {
      this.applyHeat(heatmap);
      return;
    }
    this.clearHeatEmissive();
    if (this.design) this.paintShell(this.design.materialId, "done", 1);
  }

  setDisplacement(radial: number, axial: number): void {
    this.radialScale = radial;
    this.axialScale = axial;
    this.applyScale();
  }

  replay(): void {
    if (!this.design) return;
    if (this.reduceMotion) {
      this.playing = false;
      this.draw(this.design, 1, false);
      return;
    }
    this.playing = true;
    this.elapsed = 0;
    this.lastStamp = performance.now();
    this.lastPhase = null;
    this.draw(this.design, 0, true);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.clearTank();
    this.shell.dispose();
    this.apex.dispose();
    this.knuckle.dispose();
    this.seam.dispose();
    this.girth.dispose();
    this.bead.dispose();
    for (const ply of this.plies) ply.dispose();
    this.saddle.dispose();
    this.renderer?.dispose();
  }

  private tick = (): void => {
    this.frameId = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastStamp) / 1000);
    this.lastStamp = now;
    if (this.playing && this.design) {
      this.elapsed += dt;
      const progress = Math.min(1, this.elapsed / FORMING_SECONDS);
      this.draw(this.design, progress, true);
      if (progress >= 1) this.playing = false;
    }
    this.placeCamera();
    this.renderer?.render(this.scene, this.camera);
  };

  private draw(design: TankDesign, progress: number, live: boolean): void {
    this.clearTank();
    const frame = formingFrame(design.forming, design.weldProcess, live ? progress : 1);
    if (frame.phase !== this.lastPhase) {
      this.lastPhase = frame.phase;
      this.onPhase(frame.phase);
    }
    this.paintShell(design.materialId, frame.phase, frame.local);
    const radius = design.innerDiameterM / 2 + design.wallThicknessM;
    const length = design.cylinderLengthM;
    const beadSize = Math.max(radius * 0.035, 0.012);
    this.tank.position.y = radius + 0.04;
    this.look.set(0, radius * 0.85, 0);
    this.tank.rotation.x = 0;
    this.formScaleX = 1;
    this.weldLight.intensity = 0;

    switch (design.forming) {
      case "rolled_welded":
        this.drawRolled(design, radius, length, beadSize, frame.phase, frame.local);
        break;
      case "spun":
        this.drawSpun(design, radius, length, beadSize, frame.phase, frame.local, live);
        break;
      case "laid_up":
        this.drawLaid(design, radius, length, frame.phase, frame.local);
        break;
      default:
        assertNever(design.forming);
    }
    this.addSaddles(radius, length);
    if (this.heatmap) this.applyHeat(this.heatmap);
    this.applyScale();
  }

  private drawRolled(
    design: TankDesign,
    radius: number,
    length: number,
    beadSize: number,
    phase: FormingPhase,
    local: number,
  ): void {
    const open = phase === "roll" ? 0.45 + (TAU - 0.45) * local : TAU;
    this.addCylinder(radius, length, open, this.shell);
    const heads = phase === "heads" || phase === "girth" || phase === "done";
    const slide = phase === "heads" ? (1 - local) * radius * 0.85 : 0;
    if (heads) this.addHeads(design, radius, length, slide);
    if (design.weldProcess === "none") return;
    const seamOn = phase === "long-weld" || phase === "girth" || phase === "done";
    if (seamOn) this.addLongSeam(radius + beadSize * 0.45, length, beadSize * 1.8);
    if (phase === "long-weld") this.placeBead(length * (local - 0.5), 0, radius, design);
    if (phase === "girth" || phase === "done") this.addGirthRings(radius, length, beadSize);
    if (phase === "girth") {
      const angle = local * TAU;
      this.placeBead(length / 2, Math.cos(angle) * radius, Math.sin(angle) * radius, design);
      this.placeBead(-length / 2, Math.cos(angle + Math.PI) * radius, Math.sin(angle + Math.PI) * radius, design);
    }
  }

  private drawSpun(
    design: TankDesign,
    radius: number,
    length: number,
    beadSize: number,
    phase: FormingPhase,
    local: number,
    live: boolean,
  ): void {
    const stretch = phase === "spin" ? 0.08 + 0.92 * local : 1;
    this.formScaleX = stretch;
    if (phase === "spin" && live) this.tank.rotation.x = this.elapsed * 6;
    this.addCylinder(radius, length, TAU, this.shell);
    this.addHeads(design, radius, length, 0);
    if (design.weldProcess === "none") return;
    if (phase === "girth" || phase === "done") this.addGirthRings(radius, length, beadSize);
    if (phase === "girth") {
      const angle = local * TAU;
      this.placeBead(length / 2, Math.cos(angle) * radius, Math.sin(angle) * radius, design);
      this.placeBead(-length / 2, Math.cos(angle + Math.PI) * radius, Math.sin(angle + Math.PI) * radius, design);
    }
  }

  private drawLaid(design: TankDesign, radius: number, length: number, phase: FormingPhase, local: number): void {
    this.addCylinder(radius, length, TAU, this.shell);
    this.addHeads(design, radius, length, 0);
    if (phase === "done") return;
    const fade = phase === "cure" ? 1 - local : 1;
    for (let index = 0; index < this.plies.length; index += 1) {
      const material = this.plies[index];
      if (!material) continue;
      const offset = (phase === "cure" ? 1 - local : 1) * (index + 1) * radius * 0.03;
      material.opacity = 0.32 * fade;
      this.addCylinder(radius + offset, length * 0.98, TAU, material);
    }
  }

  private addCylinder(radius: number, length: number, thetaLength: number, material: MeshStandardMaterial): void {
    const geometry = this.track(new CylinderGeometry(radius, radius, length, 72, 1, true, 0, thetaLength));
    const mesh = new Mesh(geometry, material);
    mesh.rotation.z = Math.PI / 2;
    this.tank.add(mesh);
  }

  private addHeads(design: TankDesign, radius: number, length: number, slide: number): void {
    const squash = design.dome === "hemispherical" ? 1 : 0.5;
    const crown = design.dome === "hemispherical" ? Math.PI / 2 : 0.85;
    for (const end of [1, -1] as const) {
      const x = end * (length / 2 + slide);
      const direction = end === 1 ? -1 : 1;
      this.addHead(radius, x, squash, direction, this.apex, 0, crown);
      if (design.dome === "elliptical_2to1") {
        this.addHead(radius, x, squash, direction, this.knuckle, crown, Math.PI / 2 - crown);
      }
    }
  }

  private addHead(
    radius: number,
    x: number,
    squash: number,
    direction: -1 | 1,
    material: MeshStandardMaterial,
    thetaStart: number,
    thetaLength: number,
  ): void {
    const geometry = this.track(new SphereGeometry(radius, 48, 18, 0, TAU, thetaStart, thetaLength));
    const mesh = new Mesh(geometry, material);
    mesh.scale.y = squash;
    mesh.rotation.z = direction === 1 ? Math.PI / 2 : -Math.PI / 2;
    mesh.position.x = x;
    this.tank.add(mesh);
  }

  private addLongSeam(radius: number, length: number, beadSize: number): void {
    const geometry = this.track(new BoxGeometry(length, beadSize * 0.7, beadSize * 0.7));
    const mesh = new Mesh(geometry, this.seam);
    mesh.position.z = radius;
    this.tank.add(mesh);
  }

  private addGirthRings(radius: number, length: number, beadSize: number): void {
    for (const x of [length / 2, -length / 2]) {
      const geometry = this.track(new TorusGeometry(radius, beadSize * 0.28, 8, 48));
      const mesh = new Mesh(geometry, this.girth);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.x = x;
      this.tank.add(mesh);
    }
  }

  private placeBead(x: number, y: number, z: number, design: TankDesign): void {
    const radius = Math.max(design.innerDiameterM * 0.012, 0.01);
    const geometry = this.track(new SphereGeometry(radius, 16, 12));
    const mesh = new Mesh(geometry, this.bead);
    mesh.position.set(x, y, z);
    this.tank.add(mesh);
    const friction = design.weldProcess === "fsw";
    this.bead.color.set(friction ? 0xffb089 : 0xe7f6ff);
    this.bead.emissive.set(friction ? 0xff6a2a : 0x9fd4ff);
    this.weldLight.color.set(friction ? 0xff7a3c : 0xd0ecff);
    this.weldLight.intensity = 8;
    this.tank.updateWorldMatrix(true, true);
    mesh.getWorldPosition(this.weldLight.position);
  }

  private addSaddles(radius: number, length: number): void {
    const height = radius * 0.42;
    for (const x of [length * 0.28, -length * 0.28]) {
      const geometry = this.track(new BoxGeometry(radius * 0.32, height, radius * 1.15));
      const mesh = new Mesh(geometry, this.saddle);
      mesh.position.set(x, height / 2, 0);
      this.cradle.add(mesh);
    }
  }

  private paintShell(id: MaterialId, phase: FormingPhase, local: number): void {
    const cured = shellColor(id);
    if (id === "im7_8552_qi" && phase === "plies") {
      this.shell.color.set(0x2a241c);
      this.shell.metalness = 0.15;
      this.shell.roughness = 0.62;
    } else if (id === "im7_8552_qi" && phase === "cure") {
      this.shell.color.copy(cured).lerp(new Color(0x2a241c), 1 - local);
      this.shell.metalness = 0.2;
      this.shell.roughness = 0.5;
    } else if (id === "im7_8552_qi") {
      this.shell.color.copy(cured);
      this.shell.metalness = 0.35;
      this.shell.roughness = 0.42;
      if (!this.shell.map) this.shell.map = weaveTexture();
    } else {
      this.shell.color.copy(cured);
      this.shell.metalness = 0.86;
      this.shell.roughness = 0.34;
      this.shell.map = null;
    }
    this.apex.color.copy(this.shell.color);
    this.apex.metalness = this.shell.metalness;
    this.apex.roughness = this.shell.roughness;
    this.apex.map = this.shell.map;
    this.knuckle.color.copy(this.shell.color);
    this.knuckle.metalness = this.shell.metalness;
    this.knuckle.roughness = this.shell.roughness;
    this.knuckle.map = this.shell.map;
    this.shell.needsUpdate = true;
    this.apex.needsUpdate = true;
    this.knuckle.needsUpdate = true;
  }

  private applyHeat(map: Heatmap): void {
    this.paintRegion(this.shell, map.cylinder, map.failed === "cylinder_membrane");
    this.paintRegion(this.apex, map.apex, map.failed === "dome_apex");
    this.paintRegion(this.knuckle, map.knuckle ?? map.apex, map.failed === "dome_knuckle");
    if (map.longitudinal) this.paintRegion(this.seam, map.longitudinal, map.failed === "longitudinal_weld");
    if (map.girth) this.paintRegion(this.girth, map.girth, map.failed === "girth_weld");
    this.shell.map = null;
    this.apex.map = null;
    this.knuckle.map = null;
  }

  private paintRegion(material: MeshStandardMaterial, color: string, failed: boolean): void {
    material.color.set(color);
    material.emissive.set(failed ? color : "#000000");
    material.emissiveIntensity = failed ? 0.7 : 0;
    material.metalness = 0.16;
    material.roughness = 0.5;
  }

  private clearHeatEmissive(): void {
    for (const material of [this.shell, this.apex, this.knuckle, this.seam, this.girth]) {
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
    }
    this.seam.color.set("#8d5a3c");
    this.girth.color.set("#8d5a3c");
    this.seam.metalness = 0.65;
    this.girth.metalness = 0.65;
  }

  private applyScale(): void {
    this.tank.scale.set(this.formScaleX * this.axialScale, this.radialScale, this.radialScale);
  }

  private addBay(): void {
    const floor = new Mesh(new PlaneGeometry(16, 16), new MeshStandardMaterial({ map: floorTexture(), roughness: 0.95, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const wall = new Mesh(new PlaneGeometry(16, 8), new MeshStandardMaterial({ color: 0x1c1a17, roughness: 1, metalness: 0 }));
    wall.position.set(0, 3.2, -6);
    this.scene.add(wall);
  }

  private fit(design: TankDesign): void {
    const radius = design.innerDiameterM / 2;
    const dome = design.dome === "hemispherical" ? radius : radius / 2;
    const span = Math.max(design.cylinderLengthM + dome * 2, radius * 4, 1);
    const short = this.camera.aspect > 0 && this.camera.aspect < 1.25 ? 1.28 : 1;
    if (this.fittedSpan === 0 || Math.abs(span - this.fittedSpan) / span > 0.08) {
      this.distance = span * 1.72 * short;
      this.fittedSpan = span;
    }
  }

  private placeCamera(): void {
    const flat = Math.cos(this.pitch);
    this.camera.position.set(
      this.look.x + this.distance * flat * Math.sin(this.yaw),
      this.look.y + this.distance * Math.sin(this.pitch),
      this.look.z + this.distance * flat * Math.cos(this.yaw),
    );
    this.camera.lookAt(this.look);
  }

  private resize(): void {
    if (!this.renderer) return;
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width < 1 || height < 1) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private clearTank(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.tank.clear();
    this.cradle.clear();
  }

  private track<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.yaw -= (event.clientX - this.lastX) * 0.007;
    this.pitch = Math.min(1.15, Math.max(-0.15, this.pitch + (event.clientY - this.lastY) * 0.007));
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.distance = Math.min(20, Math.max(0.7, this.distance * (1 + event.deltaY * 0.001)));
  };
}

function shellColor(id: MaterialId): Color {
  switch (id) {
    case "al2219_t87":
      return new Color(0xc9d0d4);
    case "al2195_t8":
      return new Color(0xb7c6bf);
    case "ss304l":
      return new Color(0x8b949b);
    case "inconel718_aged":
      return new Color(0xa09074);
    case "ti6al4v":
      return new Color(0x6a655c);
    case "im7_8552_qi":
      return new Color(0x3a4148);
    default:
      return assertNever(id);
  }
}

function weaveTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#16181a";
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "#6d7780";
    context.lineWidth = 2;
    for (let offset = -128; offset < 256; offset += 8) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + 128, 128);
      context.stroke();
      context.beginPath();
      context.moveTo(offset, 128);
      context.lineTo(offset + 128, 0);
      context.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(8, 3);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function floorTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#191714";
    context.fillRect(0, 0, 512, 512);
    context.strokeStyle = "#3c362e";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(256, 250, 168, 0, TAU);
    context.stroke();
    context.strokeStyle = "#e4b15a";
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(0, 470);
    context.lineTo(512, 470);
    context.stroke();
    context.fillStyle = "#6e675c";
    context.font = "600 40px sans-serif";
    context.fillText("BAY 02", 32, 58);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
