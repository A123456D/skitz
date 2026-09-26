class_name Echo
extends Node2D
## THE ECHO SYSTEM, playback half: replays recorded actions through the same
## WeaponSystem the player uses. Nothing here is a special combat path.

var frames: Array = []
var t := 0.0
var weapon := "grave"
var dmg_mul := 0.6
var hostile := false
var killable_hp := 0.0
var dead := false
var body: Sprite2D
var gun: Sprite2D
var game
var fire_cd := 0.0

func setup(game_ref, frames_: Array, weapon_: String, mul: float) -> void:
	game = game_ref
	frames = frames_
	weapon = weapon_
	dmg_mul = mul
	body = SpriteLib.sprite("ghost", 0.94)
	body.modulate = Color(0.5, 0.9, 1.0, 0.62)
	add_child(body)
	gun = SpriteLib.sprite("wp_" + weapon, 0.5)
	gun.modulate = Color(0.6, 0.95, 1.0, 0.8)
	add_child(gun)

func _physics_process(dt: float) -> void:
	if dead:
		return
	t += dt * 60.0
	var i := clampi(int(t), 0, frames.size() - 2)
	var f0: Dictionary = frames[i]
	var f1: Dictionary = frames[i + 1]
	var k: float = clampf(t - float(i), 0.0, 1.0)
	position = Vector2(lerpf(f0["x"], f1["x"], k), lerpf(f0["y"], f1["y"], k))
	var aim: float = f0["aim"]
	# hostiles (stolen echoes) aim at the player, not at history
	if hostile:
		aim = (game.player.position - position).angle()
		killable_hp -= 0.0
	gun.rotation = aim
	gun.position = Vector2(cos(aim) * 15.0, sin(aim) * 5.0 - 5.0)
	gun.scale.y = -1.0 if cos(aim) < 0.0 else 1.0
	# replayed attacks go through the shared weapon system
	var def: Dictionary = Weapons.DB.get(weapon, {})
	if def.is_empty():
		return
	if def.get("mode", "shot") == "shot":
		if f0["f"] > 0 and fire_cd <= 0.0:
			fire_cd = def["cd"]
			WeaponSystem.fire(game, def, position, aim, dmg_mul, 0, 0.0, true)
	else:
		WeaponSystem.beam_tick(game, def, position, aim, dmg_mul * 0.6, true)
	fire_cd -= dt
	if t >= frames.size():
		if game.player.kill_explode and hostile == false:
			pass
		fade_out()

func fade_out() -> void:
	dead = true
	game.on_echo_expired(self)
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.25)
	tw.tween_callback(queue_free)
