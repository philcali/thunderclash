/**
 * Camera — smooth follow with configurable smoothing and zoom.
 */
class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.targetX = 0;
    this.targetY = 0;
    this.smoothing = 5;
  }

  update(dt, target) {
    this.targetX = target.x;
    this.targetY = target.y;
    this.x += (this.targetX - this.x) * this.smoothing * dt;
    this.y += (this.targetY - this.y) * this.smoothing * dt;
  }
}

export default Camera;
