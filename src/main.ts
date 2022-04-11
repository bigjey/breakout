import "./style.css";

const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;

// game settings
const W = 800;
const H = 600;
const SIMULATION_STEP = 1000 / 300;
const FIXED_TIME = SIMULATION_STEP / 1000;
const MAX_TIME_SCALE = 12;
const MIN_TIME_SCALE = 1;

// system variables
let timeScale = 1;
let lastTick = Date.now();
let frameTime = 0;

let SCALED_TIME = FIXED_TIME / timeScale;

let updates = 0;
let renders = 0;

const keysPressed = new Map<KeyboardEvent["code"], boolean>();

// utils

const normalizeVec2 = (v: Vec2): Vec2 => {
  const l2 = v.x * v.x + v.y * v.y;
  const l = Math.sqrt(l2);
  return {
    x: v.x / l,
    y: v.y / l,
  };
};

const collidingBallRect = (
  ball: { position: Vec2; radius: number },
  rect: { position: Vec2; size: Vec2 }
): false | { direction: Vec2; amount: number; point: Vec2 } => {
  const rectL = rect.position.x - rect.size.x / 2;
  const rectR = rect.position.x + rect.size.x / 2;
  const rectT = rect.position.y - rect.size.y / 2;
  const rectB = rect.position.y + rect.size.y / 2;

  const x = Math.min(rectR, Math.max(rectL, ball.position.x));
  const y = Math.min(rectB, Math.max(rectT, ball.position.y));

  const point: Vec2 = {
    x: x - ball.position.x,
    y: y - ball.position.y,
  };

  let distance = Math.sqrt(point.x * point.x + point.y * point.y);

  const direction = normalizeVec2(point);

  if (Number.isNaN(direction.x)) {
    distance = 0;
    console.log("nan", point);
    isRunning = false;
  }

  if (distance < ball.radius) {
    return {
      direction,
      amount: ball.radius - distance,
      point,
    };
  }

  return false;
};

const collidingRectRect = (
  a: { position: Vec2; size: Vec2 },
  b: { position: Vec2; size: Vec2 }
): boolean => {
  // a.r < b.l
  if (a.position.x + a.size.x / 2 < b.position.x - b.size.x) {
    return false;
  }
  // b.r < a.l
  if (b.position.x + b.size.x / 2 < a.position.x - a.size.x) {
    return false;
  }
  // a.b < b.t
  if (a.position.y + a.size.y / 2 < b.position.y - b.size.y) {
    return false;
  }
  // b.b < a.t
  if (b.position.y + b.size.y / 2 < a.position.y - a.size.y) {
    return false;
  }
  return true;
};

// game logic
const BALL_SPEED = 500;
let PAD_SPEED = 500;

type Vec2 = { x: number; y: number };
type Object2D = { position: Vec2 };
type Ball = Object2D & {
  velocity: Vec2;
  radius: number;
  stuck: boolean;
  stuckPosition: number;
};
type Brick = Object2D & {
  size: Vec2;
  health: number;
  power: PowerUpType | undefined;
};
type Pad = Object2D & { size: Vec2 };
enum PowerUpType {
  PAD_SIZE,
  EXTRA_BALL,
}
type PowerUp = Object2D & { size: Vec2; type: PowerUpType };

let balls: Ball[] = [];
let bricks: Brick[] = [];
const pad: Pad = {
  position: {
    x: W / 2,
    y: H - 10,
  },
  size: {
    x: 100,
    y: 20,
  },
};
let powerups: PowerUp[] = [];

// powerups.push({
//   position: {
//     x: 400,
//     y: 100,
//   },
//   size: {
//     x: 40,
//     y: 20,
//   },
//   type: PowerUpType.PAD_SIZE,
// });

let isRunning = true;

const tick = () => {
  const time = Date.now();
  const dt = time - lastTick;

  lastTick = time;

  if (isRunning) {
    frameTime += dt;

    update();

    render();
  }

  if (false) {
    ctx.fillStyle = "#fff";
    ctx.font = "20px Courier";
    ctx.fillText(
      `updates ${updates} | renders ${renders} | ${frameTime / 1000}`,
      50,
      50
    );
  }

  window.requestAnimationFrame(tick);
};

const update = () => {
  while (frameTime >= SIMULATION_STEP) {
    frameTime -= SIMULATION_STEP;

    simulate();
  }
};

function isKeyPressed(key: KeyboardEvent["code"]) {
  return keysPressed.get(key) ?? false;
}

const simulate = () => {
  if (isKeyPressed("ArrowLeft") || isKeyPressed("KeyA")) {
    pad.position.x -= PAD_SPEED * SCALED_TIME;
  }

  if (isKeyPressed("ArrowRight") || isKeyPressed("KeyD")) {
    pad.position.x += PAD_SPEED * SCALED_TIME;
  }

  if (pad.position.x - pad.size.x / 2 < 0) {
    pad.position.x = pad.size.x / 2;
  } else if (pad.position.x + pad.size.x / 2 > W) {
    pad.position.x = W - pad.size.x / 2;
  }

  const newBalls: Ball[] = [];
  const newBricks: Brick[] = [];
  for (const ball of balls) {
    if (ball.stuck) {
      ball.position.x = pad.position.x + ball.stuckPosition;
    } else {
      ball.position.x += ball.velocity.x * BALL_SPEED * SCALED_TIME;
      ball.position.y += ball.velocity.y * BALL_SPEED * SCALED_TIME;
    }

    let flipX = false;
    let flipY = false;

    for (const brick of bricks) {
      if (brick.health === 0) continue;

      const overlap = collidingBallRect(ball, brick);

      if (overlap) {
        brick.health -= 1;

        if (brick.health === 0) {
          if (brick.power !== undefined) {
            powerups.push({
              position: {
                x: brick.position.x,
                y: brick.position.y,
              },
              size: {
                x: 40,
                y: 20,
              },
              type: brick.power,
            });
          }
        } else {
          newBricks.push(brick);
        }

        if (Math.abs(overlap.direction.x) > Math.abs(overlap.direction.y)) {
          flipX = true;
        } else {
          flipY = true;
        }
      }
    }

    {
      const overlap = collidingBallRect(ball, pad);
      if (overlap) {
        ball.position.x -= overlap.amount * overlap.direction.x;
        ball.position.y -= overlap.amount * overlap.direction.y;

        const stuckPosition = ball.position.x - pad.position.x;
        const hitFraction = stuckPosition / pad.size.x;

        if (false) {
          ball.stuck = true;
          ball.stuckPosition = stuckPosition;

          ball.velocity = normalizeVec2({
            x: hitFraction * 3,
            y: -1,
          });
        } else {
          ball.velocity = normalizeVec2({
            x: ball.velocity.x + hitFraction,
            y: ball.velocity.y,
          });
          if (Math.abs(overlap.direction.x) > Math.abs(overlap.direction.y)) {
            flipX = true;
          } else {
            flipY = true;
          }
        }
      }
    }

    if (flipX) {
      ball.velocity.x *= -1;
    }

    if (flipY) {
      ball.velocity.y *= -1;
    }

    if (ball.position.x - ball.radius / 2 <= 0) {
      ball.position.x = 0 + ball.radius / 2;
      ball.velocity.x *= -1;
    } else if (ball.position.x + ball.radius / 2 >= W) {
      ball.position.x = W - ball.radius / 2;
      ball.velocity.x *= -1;
    }

    if (ball.position.y - ball.radius / 2 <= 0) {
      ball.position.y = 0 + ball.radius / 2;
      ball.velocity.y *= -1;
    } else if (ball.position.y + ball.radius / 2 >= H) {
      ball.position.y = H - ball.radius / 2;
      ball.velocity.y *= -1;
    }

    if (ball.position.y + ball.radius < H) {
      newBalls.push(ball);
    }
  }

  balls = newBalls;
  bricks = newBricks;

  if (!balls.length) {
    isRunning = false;
  }

  const newPowerups = [];
  for (const pu of powerups) {
    pu.position.y += 100 * SCALED_TIME;

    if (collidingRectRect(pad, pu)) {
      if (pu.type === PowerUpType.PAD_SIZE) {
        pad.size.x = Math.min(pad.size.x + 20, 260);
      } else if (pu.type === PowerUpType.EXTRA_BALL) {
        const ball = balls[Math.floor(Math.random() * balls.length)];
        balls.push({
          position: {
            x: ball.position.x,
            y: ball.position.y,
          },
          radius: ball.radius,
          stuck: ball.stuck,
          stuckPosition: ball.stuckPosition,
          velocity: normalizeVec2({
            x:
              ball.velocity.x +
              (0.2 + Math.random() * 0.8) *
                (Math.random() < 0.5 ? -1 : 1) *
                0.2,
            y: ball.velocity.y,
          }),
        });
      }
    } else {
      newPowerups.push(pu);
    }
  }

  powerups = newPowerups;

  updates++;
};

const render = () => {
  renders++;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const brick of bricks) {
    if (brick.health == 0) {
      ctx.fillStyle = "#fff0";
    } else if (brick.health == 1) {
      ctx.fillStyle = "#fff4";
    } else if (brick.health == 2) {
      ctx.fillStyle = "#fff8";
    } else {
      ctx.fillStyle = "#fffd";
    }
    ctx.fillRect(
      brick.position.x - brick.size.x / 2 + 1,
      brick.position.y - brick.size.y / 2 + 1,
      brick.size.x - 2,
      brick.size.y - 2
    );
  }

  for (const pu of powerups) {
    if (pu.type === PowerUpType.PAD_SIZE) {
      ctx.fillStyle = "#60dee6";
    } else if (pu.type === PowerUpType.EXTRA_BALL) {
      ctx.fillStyle = "#72e653";
    } else {
      ctx.fillStyle = "#fff32b";
    }
    ctx.fillRect(
      pu.position.x - pu.size.x / 2,
      pu.position.y - pu.size.y / 2,
      pu.size.x,
      pu.size.y
    );
  }

  ctx.fillStyle = "#fff";
  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillRect(
    pad.position.x - pad.size.x / 2,
    pad.position.y - pad.size.y / 2,
    pad.size.x,
    pad.size.y
  );
};

const init = () => {
  canvas.width = W;
  canvas.height = H;

  // for (let i = 0; i < 1; i++) {
  //   balls.push({
  //     radius: 6,
  //     position: {
  //       x: W * 0.5,
  //       y: H * 0.8,
  //     },
  //     velocity: normalizeVec2({
  //       x: Math.random() - 0.5,
  //       y: Math.random() - 0.5,
  //     }),
  //     stickPosition: undefined,
  //   });
  // }

  const brickSize: Vec2 = {
    x: 40,
    y: 20,
  };

  const bb = [
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
    [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
    [3, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 0, 0, 3, 3, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 0, 0, 3, 3, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 0, 0, 3, 3, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
    [3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  ];

  if (false) {
    for (let y = 0; y < bb.length; y++) {
      for (let x = 0; x < bb[y].length; x++) {
        if (bb[y][x]) {
          bricks.push({
            size: { x: brickSize.x, y: brickSize.y },
            position: {
              x: x * brickSize.x + brickSize.x / 2,
              y: y * brickSize.y + brickSize.y / 2,
            },
            health: bb[y][x],
            power: Math.random() > 0.9 ? PowerUpType.PAD_SIZE : undefined,
          });
        }
      }
    }
  }
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) {
      const brick: Brick = {
        size: { x: brickSize.x, y: brickSize.y },
        position: {
          x: x * brickSize.x + brickSize.x / 2,
          y: y * brickSize.y + brickSize.y / 2,
        },
        health: 1,
        power: undefined,
      };

      const chance = Math.random();
      if (chance < 0.1) {
        brick.power = PowerUpType.PAD_SIZE;
      } else if (chance < 0.6) {
        brick.power = PowerUpType.EXTRA_BALL;
      }

      bricks.push(brick);
    }
  }

  balls.push({
    radius: 6,
    position: {
      x: pad.position.x,
      y: pad.position.y - pad.size.y / 2 - 6,
    },
    velocity: normalizeVec2({
      x: 0.5,
      y: -1,
    }),
    stuck: true,
    stuckPosition: 0,
  });

  // balls.push({
  //   radius: 6,
  //   position: {
  //     x: 400,
  //     y: H * 0.8,
  //   },
  //   velocity: normalizeVec2({
  //     x: 0.01,
  //     y: -1,
  //   }),
  // });

  // bricks.push({
  //   size: { x: 40, y: 20 },
  //   position: {
  //     x: W / 2 + 20,
  //     y: 200,
  //   },
  //   health: 3,
  // });

  // bricks.push({
  //   size: { x: 40, y: 20 },
  //   position: {
  //     x: W / 2 - 20,
  //     y: 200,
  //   },
  //   health: 3,
  // });

  window.addEventListener("keydown", function (e) {
    keysPressed.set(e.code, true);

    if (e.code === "BracketLeft") {
      timeScale = Math.min(MAX_TIME_SCALE, timeScale + 1);
      SCALED_TIME = FIXED_TIME / timeScale;
    } else if (e.code === "BracketRight") {
      timeScale = Math.max(MIN_TIME_SCALE, timeScale - 1);
      SCALED_TIME = FIXED_TIME / timeScale;
    }

    if (e.code === "Enter") {
      isRunning = !isRunning;
    }

    if (e.code === "Space") {
      balls.forEach((b) => (b.stuck = false));
    }
  });

  window.addEventListener("keyup", function (e) {
    keysPressed.set(e.code, false);
  });
};

init();
tick();

// circle rect resolution demo

// const b: Ball = {
//   position: {
//     x: 0,
//     y: 0,
//   },
//   radius: 100,
//   velocity: normalizeVec2({
//     x: 1,
//     y: 1,
//   }),
// };

// const br: Brick = {
//   position: { x: 400, y: 300 },
//   size: { x: 200, y: 100 },
//   health: 10,
// };

// canvas.addEventListener("mousemove", function (e) {
//   const overlap = collidingBallRect(
//     {
//       position: {
//         x: e.clientX,
//         y: e.clientY,
//       },
//       radius: b.radius,
//     },
//     br
//   );

//   ctx.clearRect(0, 0, canvas.width, canvas.height);

//   ctx.fillStyle = "#fffb";
//   ctx.fillRect(
//     br.position.x - br.size.x / 2,
//     br.position.y - br.size.y / 2,
//     br.size.x,
//     br.size.y
//   );

//   ctx.strokeStyle = "#f00b";
//   ctx.beginPath();
//   ctx.arc(e.clientX, e.clientY, b.radius, 0, Math.PI * 2);
//   ctx.closePath();
//   ctx.stroke();

//   if (overlap) {
//     let x = e.clientX;
//     let y = e.clientY;
//     if (Math.abs(overlap.direction.x) > Math.abs(overlap.direction.y)) {
//       const a = overlap.amount / Math.abs(overlap.direction.x);

//       // x -= a * overlap.direction.x;
//     } else {
//       const a = overlap.amount / Math.abs(overlap.direction.y);
//       //   y -= overlap.amount * overlap.direction.y;
//       // y -= a * overlap.direction.y;
//     }

//     x -= overlap.amount * overlap.direction.x;
//     y -= overlap.amount * overlap.direction.y;

//     console.log(e.clientX, "->", x);

//     ctx.strokeStyle = "#0f0b";
//     ctx.beginPath();
//     ctx.arc(x, y, b.radius, 0, Math.PI * 2);
//     ctx.closePath();
//     ctx.stroke();
//   }
// });
