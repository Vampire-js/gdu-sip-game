// Node 22.18+ can load the project's erasable TypeScript directly.
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { Physics } from '../src/Physics.ts';
import { Car } from '../src/Car.ts';

function setup() {
  const physics = new Physics();
  const car = new Car(physics.carMaterial);
  physics.world.addBody(car.body);
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: physics.groundMaterial });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.world.addBody(ground);
  const tick = (dt, throttle = 1, steer = 0, brake = false) => {
    const alpha = physics.step(dt, (step) => {
      car.capturePreviousPose();
      car.setGroundHeight(0);
      car.update(step, throttle, steer, brake);
    }, () => car.setGroundHeight(0));
    car.syncMesh(alpha);
  };
  return { physics, car, tick };
}

const distances = [30, 60, 120].map((fps) => {
  const { car, tick } = setup();
  for (let i = 0; i < fps * 3; i++) tick(1 / fps);
  assert.ok(Math.abs(car.body.position.y - 0.3) < 1e-6);
  assert.ok(Math.abs(car.getSpeed() - 25) < 0.1);
  return car.body.position.z;
});
assert.ok(Math.max(...distances) - Math.min(...distances) < 0.001, 'Driving must match at 30/60/120 FPS');

const { physics, car, tick } = setup();
const wall = new CANNON.Body({ mass: 0, material: physics.obstacleMaterial,
  shape: new CANNON.Box(new CANNON.Vec3(5, 2, 0.14)), position: new CANNON.Vec3(0, 1, -8) });
physics.world.addBody(wall);
for (let i = 0; i < 180; i++) tick(1 / 60);
assert.ok(car.body.position.z > -7, 'Car must not tunnel through the wall');
assert.ok(Math.abs(car.getSpeed()) < 0.5, 'HUD speed must reflect the wall stopping the car');
const stoppedZ = car.body.position.z;
for (let i = 0; i < 60; i++) tick(1 / 60, -1);
assert.ok(car.body.position.z > stoppedZ + 2, 'Reverse must escape a wall contact');

car.reset();
tick(1 / 60);
const before = car.mesh.position.z;
tick(1 / 120);
assert.ok(car.mesh.position.z < before, 'Render pose must advance between physics ticks');
car.reset();
car.syncMesh(0.5);
assert.ok(Math.abs(car.mesh.position.z) < 1e-9, 'Reset must also reset interpolation history');
assert.equal(car.getSpeed(), 0);
assert.equal(car.body.shapes.length, 1);
assert.equal(car.body.shapes[0].vertices.length, 16);
console.log('Car tests passed: timing, wall collisions, reversing, interpolation, reset and bevelled hull.');