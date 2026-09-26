class_name Projectile
extends Node2D
## Player/Echo bullets. Enemy bullets use the same class with team=1.

var vel := Vector2.ZERO
var dmg := 10.0
var life := 1.5
var team := 0
var is_echo := false
var is_crit := false
var kb := 60.0
var hit: Array = []
var game
var spr: Sprite2D

func setup(game_ref, pos: Vector2, vel_: Vector2, dmg_: float, echo: bool, kb_: float, sprite: String, size: float, crit: bool) -> void:
	game = game_ref
	position = pos
	vel = vel_
	dmg = dmg_
	is_echo = echo
	is_crit = crit
	kb = kb_
	team = 0
	life = 1.6
	spr = SpriteLib.sprite(sprite, 0.5, size)
	spr.rotation = vel.angle()
	add_child(spr)

func _physics_process(dt: float) -> void:
	position += vel * dt
	life -= dt
	if life <= 0.0 or absf(position.x) > game.half + 80.0 or absf(position.y) > game.half + 80.0:
		game.erase_bullet(self)
		return
	for e in game.enemies:
		if e.dead or hit.has(e):
			continue
		if position.distance_to(e.position) < e.r + 6.0 * spr.scale.x:
			hit.append(e)
			e.hurt(dmg, is_echo, vel.normalized() * kb)
			if e.dead and is_echo == false:
				pass
			game.erase_bullet(self)
			return
