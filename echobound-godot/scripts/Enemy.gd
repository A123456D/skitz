class_name Enemy
extends Node2D
## Role-driven enemy. data/enemies.gd says what it is; this says how roles behave.

var type := "husk"
var def: Dictionary
var hp := 20.0
var max_hp := 20.0
var spd := 90.0
var dmg := 8.0
var r := 12.0
var xp := 1
var dead := false
var flash := 0.0
var kb := Vector2.ZERO
var t := 0.0
var anim_t := 0.0
var body: Sprite2D
var game

func setup(game_ref, type_: String, pos: Vector2, hp_scale: float) -> void:
	game = game_ref
	type = type_
	def = EnemyDB.DB[type_]
	position = pos
	hp = def["hp"] * hp_scale
	max_hp = hp
	spd = def["spd"]
	dmg = def["dmg"]
	r = def["r"]
	xp = def["xp"]
	body = SpriteLib.sprite(def["frames"][0], 0.9)
	add_child(body)

func _physics_process(dt: float) -> void:
	if dead:
		return
	t += dt
	flash = maxf(0.0, flash - dt)
	var p = Game.I.player
	var to_p: Vector2 = p.position - position
	var dir := to_p.normalized()
	var mv := Vector2.ZERO
	match def.get("role", "chase"):
		"chase":
			mv = dir * spd
		"kiter":
			var band: float = def.get("band", 300.0)
			var d := to_p.length()
			var want := dir if d > band + 40.0 else (-dir if d < band - 40.0 else Vector2.ZERO)
			mv = want * spd + dir.orthogonal() * spd * 0.4 * sin(t * 1.3)
			t += 0.0
			if t > def.get("burst_cd", 2.4):
				t = 0.0
				game.enemy_shoot(position, p.position, dmg)
		"suppressor":
			mv = dir * spd if to_p.length() > 220.0 else -dir * spd * 0.4
		"thief":
			mv = dir * spd
	position += (mv + kb) * dt
	kb = kb.lerp(Vector2.ZERO, 8.0 * dt)
	position.x = clampf(position.x, -game.half, game.half)
	position.y = clampf(position.y, -game.half, game.half)
	# walk animation + hit squash
	anim_t += dt * (6.0 if mv.length() > 4.0 else 2.0)
	var frames: Array = def["frames"]
	body.texture = SpriteLib.tex(frames[int(anim_t) % frames.size()])
	var sq := 1.0 + sin(t * 9.0) * 0.05
	body.scale.y = 1.0 * (0.85 if flash > 0.05 else sq)
	body.modulate = Color(1.6, 1.2, 1.1) if flash > 0.0 else Color.WHITE
	# contact damage
	if to_p.length() < r + 13.0 and p.iframes <= 0.0:
		p.hurt(dmg)

func hurt(amt: float, is_echo: bool, knock: Vector2) -> void:
	if dead:
		return
	hp -= amt
	flash = 0.09
	kb += knock * (1.4 / r)
	if hp <= 0.0:
		die(is_echo)

func die(is_echo: bool) -> void:
	dead = true
	var fam: String = def.get("gib", "#c96a4a")
	game.enemy_death(position, fam, max_hp > 45.0, is_echo)
	if Game.I.player.kill_explode and is_echo == false:
		game.explode(position, 90.0, 25.0 + Game.I.elapsed * 0.1)
	game.on_enemy_dead(self)
	queue_free()
