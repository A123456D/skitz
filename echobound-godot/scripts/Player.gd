class_name Player
extends Node2D
## The Warden. Moves, aims, fires through WeaponSystem, feeds the ActionRecorder.

var max_hp := 100.0
var hp := 100.0
var speed := 250.0
var weapon := "grave"
var iframes := 0.0
var dash_cd := 0.0
var dash_t := 0.0
var dash_dir := Vector2.ZERO
var cd := 0.0
var fired_this_frame := 0
var beam_on := false
var alive := true

# run stats (upgrades mutate these)
var dmg_mul := 1.0
var cd_mul := 1.0
var move_mul := 1.0
var extra_shots := 0
var crit := 0.0
var echo_mul := 0.6
var echo_period := 10.0
var magnet := 90.0
var kill_explode := false
var level := 1
var xp := 0.0
var xp_next := 5

var body: Sprite2D
var gun: Sprite2D
var game
var walk_t := 0.0

func _ready() -> void:
	body = SpriteLib.sprite("warden0", 0.94)
	add_child(body)
	gun = SpriteLib.sprite("wp_grave", 0.5)
	game.add_child(gun)

func set_weapon(w: String) -> void:
	weapon = w
	gun.texture = SpriteLib.tex("wp_" + w)

func _physics_process(dt: float) -> void:
	if not alive:
		return
	var mv := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if Input.is_key_pressed(KEY_A): mv.x -= 1
	if Input.is_key_pressed(KEY_D): mv.x += 1
	if Input.is_key_pressed(KEY_W): mv.y -= 1
	if Input.is_key_pressed(KEY_S): mv.y += 1
	mv = mv.limit_length(1.0)

	dash_cd = maxf(0.0, dash_cd - dt)
	iframes = maxf(0.0, iframes - dt)
	if Input.is_key_pressed(KEY_SPACE) and dash_cd <= 0.0:
		dash_dir = mv if mv.length() > 0.1 else Vector2.from_angle(rotation)
		dash_t = 0.22
		dash_cd = 1.4
		iframes = maxf(iframes, 0.4)
	if dash_t > 0.0:
		dash_t -= dt
		position += dash_dir * speed * 3.4 * dt
	else:
		position += mv * speed * move_mul * dt
	position.x = clampf(position.x, -game.half, game.half)
	position.y = clampf(position.y, -game.half, game.half)

	# aim
	var aim: float = (game.get_global_mouse_position() - position).angle()
	rotation = 0.0
	# body + walk animation
	var moving := mv.length() > 0.1
	walk_t += dt * (11.0 if moving else 2.5)
	body.texture = SpriteLib.tex("warden0") if not moving else SpriteLib.tex("warden%d" % (1 + int(walk_t) % 3))
	body.scale.x = -1.0 if cos(aim) < 0.0 else 1.0
	# held weapon rotates toward aim
	gun.position = position + Vector2(cos(aim) * 15.0, sin(aim) * 5.0 - 5.0)
	gun.rotation = aim
	gun.scale.y = -1.0 if cos(aim) < 0.0 else 1.0

	# fire through the shared system
	fired_this_frame = 0
	beam_on = false
	var def: Dictionary = Weapons.DB[weapon]
	cd = maxf(0.0, cd - dt)
	if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		if def.get("mode", "shot") == "beam":
			beam_on = true
			WeaponSystem.beam_tick(game, def, position, aim, dmg_mul, false)
		elif cd <= 0.0:
			cd = def["cd"] * cd_mul
			fired_this_frame = 1
			WeaponSystem.fire(game, def, position, aim, dmg_mul, extra_shots, crit, false)
	# feed the recorder (the Echo system watches, uninterrupted)
	game.recorder.push(position.x, position.y, aim, fired_this_frame, beam_on)

func hurt(dmg: float) -> void:
	if iframes > 0.0 or not alive:
		return
	hp -= dmg
	iframes = 0.5
	if hp <= 0.0:
		hp = 0.0
		alive = false
		game.on_player_dead()

func add_xp(v: float) -> void:
	xp += v
	while xp >= xp_next:
		xp -= xp_next
		level += 1
		xp_next = int(5 + level * 3 + level * level * 0.35)
		game.queue_level_up()
