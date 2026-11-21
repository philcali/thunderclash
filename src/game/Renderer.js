/**
 * Renderer — Canvas 2D rendering for the game.
 * Handles camera transform, entity drawing, HUD, and particle effects.
 *
 * All coordinates are CSS pixels (the DPR base transform is set by Game._resize).
 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Baked enemy sprites (offscreen canvases), keyed by type:radius:color.
    // shadowBlur is the expensive part — baking it once per variant turns
    // 500+ enemies from ~2000 glow passes into ~500 cheap drawImages.
    this._enemySprites = new Map();
  }

  get displayWidth() {
    return this.canvas.clientWidth || window.innerWidth;
  }

  get displayHeight() {
    return this.canvas.clientHeight || window.innerHeight;
  }

  /** HUD scale factor — compact on phones, full size on tablet/desktop. */
  hudScale(dw) {
    return clamp(dw / 520, 0.72, 1);
  }

  render(game) {
    const ctx = this.ctx;
    const dw = this.displayWidth;
    const dh = this.displayHeight;

    const { camera, player, entityManager, score, waveSystem } = game;

    // Dark underworld background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, dw, dh);

    // Subtle radial gradient (brighter near player)
    const gradient = ctx.createRadialGradient(
      dw / 2, dh / 2, 50,
      dw / 2, dh / 2, dw * 0.7
    );
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#0a0a14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, dw, dh);

    ctx.save();

    // Camera transform: center on player (display-space)
    ctx.translate(dw / 2, dh / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Marble grid floor
    this._drawGrid(ctx, camera, dw, dh, game);

    // Collect entities by layer
    const projectiles = entityManager.getByType('projectile');
    const enemies = entityManager.getByType('enemy');
    const particles = entityManager.getByType('particle');
    const zones = entityManager.getByType('zone');
    const rings = entityManager.getByType('ring');

    // Ability zones (ground layer, under everything)
    this._drawZones(ctx, zones);

    // Draw enemies (behind player)
    this._drawEnemies(ctx, enemies, game);

    // Draw player
    if (player) this._drawPlayer(ctx, player, game);

    // Draw projectiles
    this._drawProjectiles(ctx, projectiles);

    // Ability shockwave rings (above projectiles)
    this._drawRings(ctx, rings);

    // Draw particles (on top)
    this._drawParticles(ctx, particles);

    ctx.restore();

    // Fog of war — radial gradient centered on player's screen position
    this._drawFogOfWar(ctx, dw, dh, game);

    // HUD (screen space, not camera space)
    this._drawHUD(ctx, dw, dh, game);

    // Boss health bar + announcement banner (screen space)
    this._drawBossUI(ctx, dw, dh, game);

    // Virtual sticks + control hints (screen space)
    this._drawSticks(ctx, dw, dh, game);

    // Ability button (screen space, bottom-right)
    this._drawAbilityButton(ctx, game);
  }

  /** Boss health bar (top center) + "X APPROACHES" banner. */
  _drawBossUI(ctx, dw, dh, game) {
    const safe = game.safeInsets || { top: 0, bottom: 0 };
    const enemies = game.entityManager.getByType('enemy');
    const boss = enemies.find((e) => e.isBoss);

    if (boss) {
      const s = this.hudScale(dw);
      const barW = Math.min(340, dw * 0.7);
      const barH = 8 * s;
      const barX = dw / 2 - barW / 2;
      const barY = Math.max(safe.top + 10, 10) + 34 * s;
      const pct = Math.max(0, boss.health / boss.maxHealth);

      ctx.save();
      // Name
      ctx.font = `600 ${Math.round(11 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
      const name = (boss.bossName || (boss.def && boss.def.name) || 'BOSS').toUpperCase();
      ctx.fillText(name, dw / 2, barY - 5);
      // Bar frame
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
      // Fill
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#b71c1c');
      grad.addColorStop(1, '#ffd700');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW * pct, barH);
      ctx.restore();
    }

    const banner = game.waveSystem && game.waveSystem.banner;
    if (banner && banner.timer > 0) {
      const alpha = Math.min(1, banner.timer / 0.6);
      const size = clamp(dw * 0.085, 22, 40);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffd700';
      ctx.fillText(banner.text, dw / 2, dh * 0.3);
      ctx.restore();
    }
  }

  /** Floor zone from wave number — zones 1-5 map to floor textures. */
  _getFloorZone(waveNumber) {
    if (waveNumber <= 5) return 1;
    if (waveNumber <= 10) return 2;
    if (waveNumber <= 15) return 3;
    if (waveNumber <= 20) return 4;
    return 5;
  }

  // ── Grid (marble floor) ──────────────────────────────────────

  _drawGrid(ctx, camera, viewWidth, viewHeight, game) {
    const { waveSystem, floorTextures, _floorsReady } = game;
    const zone = this._getFloorZone(waveSystem?.currentWave || 1);
    const texture = _floorsReady ? floorTextures[zone] : null;

    if (texture && texture.complete && texture.naturalWidth > 0) {
      // Tiled floor texture
      const gridSize = 128;
      const halfW = viewWidth / 2 / camera.zoom;
      const halfH = viewHeight / 2 / camera.zoom;
      const startX = Math.floor((camera.x - halfW) / gridSize) * gridSize;
      const startY = Math.floor((camera.y - halfH) / gridSize) * gridSize;
      const endX = startX + viewWidth / camera.zoom + gridSize * 2;
      const endY = startY + viewHeight / camera.zoom + gridSize * 2;

      for (let x = startX; x < endX; x += gridSize) {
        for (let y = startY; y < endY; y += gridSize) {
          ctx.drawImage(texture, x, y, gridSize, gridSize);
        }
      }
    } else {
      // Fallback: subtle gold grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.03)';
      ctx.lineWidth = 0.5 / camera.zoom;

      const gridSize = 64;
      const halfW = viewWidth / 2 / camera.zoom;
      const halfH = viewHeight / 2 / camera.zoom;
      const startX = Math.floor((camera.x - halfW) / gridSize) * gridSize;
      const startY = Math.floor((camera.y - halfH) / gridSize) * gridSize;
      const endX = startX + viewWidth / camera.zoom + gridSize * 2;
      const endY = startY + viewHeight / camera.zoom + gridSize * 2;

      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Enemies ──────────────────────────────────────────────────

  _drawEnemies(ctx, enemies, game) {
    // Viewport cull — only draw what's on screen (plus a margin).
    const zoom = (game.camera && game.camera.zoom) || 1;
    const half = Math.max(this.displayWidth, this.displayHeight) / 2 / zoom + 80;
    const camX = (game.camera && game.camera.x) || 0;
    const camY = (game.camera && game.camera.y) || 0;
    const px = (game.player && game.player.x) || 0;
    const py = (game.player && game.player.y) || 0;

    for (const enemy of enemies) {
      if (Math.abs(enemy.x - camX) > half || Math.abs(enemy.y - camY) > half) continue;

      const def = enemy.def || {};
      const r = enemy.radius;
      const color = enemy.color || def.color || '#7b1fa2';

      // Baked body (shadow + spikes/horns + glow), or live fallback
      const sprite = this._enemySprite(enemy.enemyType || 'enemy', r, def, color);
      if (sprite) {
        ctx.drawImage(sprite.canvas, enemy.x - sprite.half, enemy.y - sprite.half);
      } else {
        this._drawEnemyBody(ctx, enemy, def, color);
      }

      // Eyes (live: track the player; Cerberus has three)
      const eyeSize = Math.max(2, r * 0.2);
      const eyeOffset = r * 0.35;
      const eyeAngle = Math.atan2(py - enemy.y, px - enemy.x);
      const eyeOffsets = def.threeEyes ? [-0.5, 0, 0.5] : [-0.4, 0.4];

      const eyeColor = def.threeEyes ? '#00e676' : '#ff6f00';
      ctx.fillStyle = eyeColor;
      ctx.shadowColor = eyeColor;
      ctx.shadowBlur = 4;
      for (const off of eyeOffsets) {
        ctx.beginPath();
        ctx.arc(
          enemy.x + Math.cos(eyeAngle + off) * eyeOffset,
          enemy.y + Math.sin(eyeAngle + off) * eyeOffset,
          eyeSize, 0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Health bar (if damaged)
      if (enemy.health < enemy.maxHealth) {
        const barW = enemy.radius * 2;
        const barH = 3;
        const barX = enemy.x - barW / 2;
        const barY = enemy.y - enemy.radius - 10;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        const pct = Math.max(0, enemy.health / enemy.maxHealth);
        ctx.fillStyle = pct > 0.5 ? '#4caf50' : pct > 0.25 ? '#ff9800' : '#f44336';
        ctx.fillRect(barX, barY, barW * pct, barH);
      }

      // Boss indicator
      if (enemy.isBoss) {
        ctx.save();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Stunned (Zeus Thunder Barrier)
      if (enemy.stunTimer > 0) {
        ctx.save();
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 6;
        ctx.font = `${Math.max(11, Math.round(r * 0.9))}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', enemy.x, enemy.y - r - 20);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.restore();
      }
    }
  }

  /**
   * Bake one enemy variant (shadow, spikes, horns, glowing body, inner
   * detail) to an offscreen canvas. Only the per-frame parts (eyes,
   * health bar, boss ring, stun) are drawn live.
   */
  _enemySprite(type, r, def, color) {
    const key = `${type}:${Math.round(r)}:${color}`;
    const cached = this._enemySprites.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined' || !document.createElement) return null;

    const half = Math.ceil(r * 1.5 + 12); // margin for glow/spikes/shadow
    const canvas = document.createElement('canvas');
    canvas.width = half * 2;
    canvas.height = half * 2;
    const g = canvas.getContext('2d');
    const cx = half, cy = half;

    // Ground shadow
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath();
    g.ellipse(cx, cy + r * 0.7, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
    g.fill();

    // Boss spikes (radial crown behind the body)
    if (def.spikes) {
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 8;
      const spikes = 8;
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const aL = a - 0.16, aR = a + 0.16;
        g.beginPath();
        g.moveTo(cx + Math.cos(aL) * r, cy + Math.sin(aL) * r);
        g.lineTo(cx + Math.cos(a) * (r + r * 0.45), cy + Math.sin(a) * (r + r * 0.45));
        g.lineTo(cx + Math.cos(aR) * r, cy + Math.sin(aR) * r);
        g.closePath();
        g.fill();
      }
      g.shadowBlur = 0;
    }

    // Medium-tier horns (minotaur)
    if (def.horns) {
      g.fillStyle = def.bodyColor || color;
      const hornW = r * 0.34, hornH = r * 0.75;
      for (const side of [-1, 1]) {
        const bx = cx + side * r * 0.55;
        g.beginPath();
        g.moveTo(bx - hornW / 2, cy - r * 0.45);
        g.lineTo(bx + side * hornW * 0.4, cy - r * 0.45 - hornH);
        g.lineTo(bx + hornW / 2, cy - r * 0.6);
        g.closePath();
        g.fill();
      }
    }

    // Glowing body (the expensive blur, baked once)
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;

    // Inner detail (darker center for underworld look)
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath();
    g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    g.fill();

    const sprite = { canvas, half };
    this._enemySprites.set(key, sprite);
    return sprite;
  }

  /** Live fallback for environments without an offscreen canvas. */
  _drawEnemyBody(ctx, enemy, def, color) {
    const r = enemy.radius;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y + r * 0.7, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Ability visuals ────────────────────────────────────────────

  _drawZones(ctx, zones) {
    for (const z of zones) {
      const fade = Math.max(0, Math.min(1, z.duration / 0.5));
      ctx.save();
      ctx.globalAlpha = 0.14 * fade;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.45 * fade;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  _drawRings(ctx, rings) {
    for (const ring of rings) {
      const p = Math.max(0, Math.min(1, ring.progress));
      const rad = 12 + (ring.maxRadius - 12) * p;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width || 6;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawAbilityButton(ctx, game) {
    const ab = game.abilitySystem;
    if (!ab || !game.player) return;
    const b = game.input.abilityButtonRect();
    const color = ab.ability.color;
    const ready = ab.ready;

    ctx.save();
    // Base disc
    ctx.fillStyle = 'rgba(10, 12, 24, 0.72)';
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.fill();

    // Cooldown sweep (dark wedge = time remaining, from 12 o'clock)
    if (!ready && ab.cooldownTotal > 0) {
      const frac = Math.max(0, Math.min(1, ab.cooldownRemaining / ab.cooldownTotal));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.moveTo(b.cx, b.cy);
      ctx.arc(b.cx, b.cy, b.r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }

    // Ring — glows + pulses when ready
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
    ctx.globalAlpha = ready ? 0.55 + pulse * 0.45 : 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = ready ? 14 : 4;
    ctx.beginPath();
    ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Icon
    ctx.fillStyle = ready ? color : 'rgba(255, 255, 255, 0.4)';
    ctx.font = `${Math.round(b.r * 1.05)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ab.ability.icon, b.cx, b.cy + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // First-run label
    if (game.hintTimer > 0) {
      ctx.globalAlpha = Math.min(1, game.hintTimer / 1.5) * 0.9;
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(Math.min(12, b.r * 0.42))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('ABILITY', b.cx, b.cy - b.r - 8);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ── Player ───────────────────────────────────────────────────

  _drawPlayer(ctx, player, game) {
    // Invincibility flash
    if (player.invincible && Math.floor(player.invincibleTimer * 15) % 2 === 0) {
      // Skip drawing this frame
      return;
    }

    // God color glow
    const godColor = player.god?.color || '#ffd700';

    // Outer glow
    ctx.save();
    ctx.shadowColor = godColor;
    ctx.shadowBlur = 20;
    ctx.fillStyle = godColor + '33';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.save();
    ctx.fillStyle = godColor;
    ctx.shadowColor = godColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Inner highlight
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(player.x - 3, player.y - 3, player.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // God icon
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = `${player.radius * 1.2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.god?.icon || '⚡', player.x, player.y);
    ctx.restore();

    // Shield visual
    if (player.shield > 0) {
      ctx.save();
      const shieldAlpha = Math.min(1, player.shieldTimer / 5) * 0.5;
      ctx.strokeStyle = `rgba(100, 200, 255, ${shieldAlpha})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#42a5f5';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Aim indicator — manual aim first, else the auto-aim direction
    const aimDir = game.input.getAimDir() || game.weaponSystem?.lastAim || null;
    if (aimDir) {
      const aimLen = 30;
      ctx.save();
      ctx.strokeStyle = godColor + '55';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(
        player.x + aimDir.x * (player.radius + 4),
        player.y + aimDir.y * (player.radius + 4)
      );
      ctx.lineTo(
        player.x + aimDir.x * (player.radius + 4 + aimLen),
        player.y + aimDir.y * (player.radius + 4 + aimLen)
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Projectiles ──────────────────────────────────────────────

  _drawProjectiles(ctx, projectiles) {
    for (const proj of projectiles) {
      const color = proj.color || '#ffd700';

      // Glow
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Bright center
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Lightning-specific: draw chain lines
      if (proj.type === 'lightning' && proj.chains) {
        for (const target of proj.chains) {
          ctx.save();
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 8;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(proj.x, proj.y);
          // Jagged lightning path
          const dx = target.x - proj.x;
          const dy = target.y - proj.y;
          const segments = 4;
          for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const jx = (Math.random() - 0.5) * 15;
            const jy = (Math.random() - 0.5) * 15;
            ctx.lineTo(
              proj.x + dx * t + jx,
              proj.y + dy * t + jy
            );
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // ── Particles ────────────────────────────────────────────────

  _drawParticles(ctx, particles) {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.fillRect(
        p.x - p.size / 2,
        p.y - p.size / 2,
        p.size * alpha,
        p.size * alpha
      );
      ctx.restore();
    }
  }

  // ── Virtual sticks + hints ───────────────────────────────────

  _drawSticks(ctx, dw, dh, game) {
    const input = game.input;
    const safe = game.safeInsets || { top: 0, bottom: 0 };

    // Active sticks
    this._drawStick(ctx, input, input.stickMove, '#42a5f5');
    this._drawStick(ctx, input, input.stickAim, '#ffd700');

    // First-run control hints (fades out; hidden once a zone is used)
    if (game.hintTimer > 0) {
      const s = this.hudScale(dw);
      const R = input.stickRadius();
      const alpha = Math.min(1, game.hintTimer / 1.5) * 0.55;
      const y = dh - (safe.bottom + R + 34 * s);
      const hint = (x, label, used) => {
        if (used) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(11 * s)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.restore();
      };
      hint(dw * 0.22, 'MOVE', input.stickMove.used);
      hint(dw * 0.78, 'AIM', input.stickAim.used);
    }
  }

  _drawStick(ctx, input, stick, color) {
    if (!stick.active) return;
    const R = input.stickRadius();
    ctx.save();
    // Base disc
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(stick.baseX, stick.baseY, R, 0, Math.PI * 2);
    ctx.fill();
    // Base ring
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(stick.baseX, stick.baseY, R, 0, Math.PI * 2);
    ctx.stroke();
    // Knob
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(stick.knobX, stick.knobY, R * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Fog of war ───────────────────────────────────────────────

  _drawFogOfWar(ctx, dw, dh, game) {
    if (!game.player) return;

    // Player's screen position (center of viewport)
    const px = dw / 2;
    const py = dh / 2;

    // Fog radius — scales with screen size for consistent feel
    const fogRadius = Math.min(dw, dh) * 0.45;
    const fogInner = fogRadius * 0.3; // clear zone around player

    // Darkness intensity — gets darker as you go deeper (wave 21+)
    const zone = this._getFloorZone(game.waveSystem?.currentWave || 1);
    // Zone 1-2: light fog, zone 3-4: medium, zone 5: heavy
    const darkness = 0.35 + zone * 0.12;

    const gradient = ctx.createRadialGradient(px, py, fogInner, px, py, fogRadius);
    gradient.addColorStop(0, `rgba(10, 10, 20, 0)`);
    gradient.addColorStop(0.7, `rgba(10, 10, 20, ${darkness * 0.5})`);
    gradient.addColorStop(1, `rgba(10, 10, 20, ${darkness})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, dw, dh);
  }

  // ── HUD ──────────────────────────────────────────────────────

  _drawHUD(ctx, dw, dh, game) {
    const { player, score, waveSystem } = game;
    if (!player) return;

    const godColor = player.god?.color || '#ffd700';
    const s = this.hudScale(dw);
    const safe = game.safeInsets || { top: 0, bottom: 0 };
    const top = Math.max(10, safe.top + 10);

    // ── Left column: health, shield, god ──
    const barX = 16;
    const barY = top;
    const barW = Math.min(200, dw * 0.30);
    const barH = 15 * s;

    // Health bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);

    const healthPct = Math.max(0, player.health / player.maxHealth);
    const healthColor = healthPct > 0.5 ? '#4caf50' : healthPct > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = healthColor;
    ctx.fillRect(barX, barY, barW * healthPct, barH);

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(10 * s)}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(player.health)} / ${player.maxHealth}`, barX + 4, barY + barH / 2);

    // Shield bar (below health)
    let belowY = barY + barH + 6 * s;
    if (player.shield > 0) {
      const shieldBarH = 7 * s;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(barX - 1, belowY - 1, barW + 2, shieldBarH + 2);
      ctx.fillStyle = '#1a237e';
      ctx.fillRect(barX, belowY, barW, shieldBarH);
      ctx.fillStyle = '#42a5f5';
      ctx.fillRect(barX, belowY, barW * Math.min(1, player.shield / 90), shieldBarH);
      ctx.fillStyle = '#90caf9';
      ctx.font = `${Math.round(8 * s)}px monospace`;
      ctx.fillText(`SHIELD ${Math.ceil(player.shield)}`, barX + 4, belowY + shieldBarH / 2);
      belowY += shieldBarH + 8 * s;
    }

    // God name + icon (below bars)
    ctx.fillStyle = godColor;
    ctx.font = `bold ${Math.round(13 * s)}px monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${player.god?.icon || ''} ${player.god?.name || 'God'}`, barX, belowY + 8 * s);

    // ── Center: wave ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.round(19 * s)}px monospace`;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    ctx.fillText(`Wave ${waveSystem.currentWave}`, dw / 2, top + 24 * s);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#aaa';
    ctx.font = `${Math.round(11 * s)}px monospace`;
    const enemiesRemaining = waveSystem.enemiesRemaining || 0;
    ctx.fillText(enemiesRemaining > 0 ? `Enemies: ${enemiesRemaining}` : 'Wave cleared!', dw / 2, top + 42 * s);

    // ── Right column: score, timer ──
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.round(17 * s)}px monospace`;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 6;
    ctx.fillText(`Score: ${score.total}`, dw - 16, top + 24 * s);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ccc';
    ctx.font = `${Math.round(12 * s)}px monospace`;
    const m = Math.floor(score.elapsed / 60);
    const sec = Math.floor(score.elapsed % 60);
    ctx.fillText(`${m}:${sec.toString().padStart(2, '0')}`, dw - 16, top + 42 * s);

    // ── Bottom-left: active blessings ──
    const blessingList = game.upgradeSystem?.selectedUpgrades || [];
    if (blessingList.length > 0) {
      ctx.textAlign = 'left';
      ctx.font = `${Math.round(10 * s)}px monospace`;
      const displayCount = Math.min(blessingList.length, 5);
      for (let i = 0; i < displayCount; i++) {
        const b = blessingList[i];
        ctx.fillStyle = b.color || '#ffd700';
        const y = dh - (safe.bottom + 16 * s) - (displayCount - 1 - i) * 13 * s;
        ctx.fillText(`${b.icon} ${b.name}`, 16, y);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

export default Renderer;
