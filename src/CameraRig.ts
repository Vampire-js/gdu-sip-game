import * as THREE from "three";
const CAMERA_HEIGHT = 3.2;
const LOOK_HEIGHT = 2.2;
/** Original chase camera with a screen-space drag offset. No orbit or zoom. */
export class CameraRig {
  enabled = false;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly groundHeight: (x: number, z: number) => number;
  private readonly canvas: HTMLCanvasElement;
  private readonly target = new THREE.Vector3();
  private readonly pan = new THREE.Vector3();
  private readonly appliedPan = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private pointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement,
    groundHeight: (x: number, z: number) => number) {
    this.camera = camera;
    this.groundHeight = groundHeight;
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onEnd);
    canvas.addEventListener("pointercancel", this.onEnd);
    canvas.addEventListener("lostpointercapture", this.onEnd);
    window.addEventListener("blur", this.releasePointer);
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.enabled || this.pointer !== null || event.button !== 0) return;
    event.preventDefault();
    this.pointer = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.enabled || this.pointer !== event.pointerId) return;
    event.preventDefault();
    const distance = this.camera.position.distanceTo(this.target);
    const unitsPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) /
      Math.max(1, this.canvas.clientHeight);
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.pan.addScaledVector(this.right, -(event.clientX - this.lastX) * unitsPerPixel);
    this.pan.addScaledVector(this.up, (event.clientY - this.lastY) * unitsPerPixel);
    this.pan.clampLength(0, 10);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  private onEnd = (event: PointerEvent): void => {
    if (this.pointer === event.pointerId) this.releasePointer();
  };

  private releasePointer = (): void => {
    const id = this.pointer;
    this.pointer = null;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  };

  reset(carPosition: THREE.Vector3, forward: THREE.Vector3): void {
    this.releasePointer();
    this.pan.set(0, 0, 0);
    this.appliedPan.set(0, 0, 0);
    this.desiredPosition.copy(carPosition).addScaledVector(forward, -8);
    this.desiredPosition.y += CAMERA_HEIGHT;
    this.camera.position.copy(this.desiredPosition);
    this.target.copy(carPosition).addScaledVector(forward, 4);
    this.target.y += LOOK_HEIGHT;
    this.keepAboveTerrain();
  }

  update(dt: number, carPosition: THREE.Vector3, forward: THREE.Vector3): void {
    // Remove last frame's pan before smoothing the normal chase pose.
    this.camera.position.sub(this.appliedPan);
    this.target.sub(this.appliedPan);
    this.desiredPosition.copy(carPosition).addScaledVector(forward, -8);
    this.desiredPosition.y += CAMERA_HEIGHT;
    this.desiredTarget.copy(carPosition).addScaledVector(forward, 4);
    this.desiredTarget.y += LOOK_HEIGHT;
    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-dt / 0.15));
    this.target.lerp(this.desiredTarget, 1 - Math.exp(-dt / 0.1));
    this.appliedPan.lerp(this.pan, 1 - Math.exp(-dt / 0.06));
    // Translate eye and target equally: dragging never rotates or zooms.
    this.camera.position.add(this.appliedPan);
    this.target.add(this.appliedPan);
    this.keepAboveTerrain();
  }

  private keepAboveTerrain(): void {
    const lift = Math.max(0, this.groundHeight(this.camera.position.x, this.camera.position.z) + 0.8 - this.camera.position.y);
    this.camera.position.y += lift;
    this.target.y += lift;
    this.appliedPan.y += lift;
    this.camera.lookAt(this.target);
  }
}