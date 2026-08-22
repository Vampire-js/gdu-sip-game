import * as CANNON from "cannon-es";

/**
 * Cannon-es world with named material slots so contact behaviour between
 * groups (car / ground / obstacle) can be tuned in one place.
 */
export class Physics {
  readonly world: CANNON.World;

  readonly groundMaterial = new CANNON.Material("ground");
  readonly carMaterial = new CANNON.Material("car");
  readonly obstacleMaterial = new CANNON.Material("obstacle");

  private readonly fixedStep = 1 / 60;
  private readonly maxSubSteps = 4;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -20, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    // More iterations = tighter contact resolution -> less vertical jitter.
    (this.world.solver as CANNON.GSSolver).iterations = 20;

    // Car vs ground: zero friction, zero bounce. The car is driven by direct
    // velocity assignment (no wheel torques), so ground friction would only
    // fight the arcade motion. Y is locked on the car body separately, so
    // there's no vertical contact to tune here.
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.carMaterial, this.groundMaterial, {
        friction: 0,
        restitution: 0,
      })
    );

    // Car vs obstacle: some bounce and slide so hits feel arcadey.
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.carMaterial, this.obstacleMaterial, {
        friction: 0.3,
        restitution: 0.2,
      })
    );

    // Obstacle vs ground: normal friction, no bounce, so they settle quickly.
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.obstacleMaterial, this.groundMaterial, {
        friction: 0.5,
        restitution: 0,
      })
    );
  }

  step(dt: number): void {
    this.world.step(this.fixedStep, dt, this.maxSubSteps);
  }
}
