class_name Game
extends Node2D
## Root: owns run state, the director, gems, beams and the Echo cadence.
## Systems are separate; content lives in data/.

static var I

const DT := 1.0 / 60.0
const HALF := 1500.0

var half := 1500.0
var elapsed := 0.0
var player: Player
var recorder := ActionRecorder.new()
var hud: HUD
var cam: Camera2D
var bullet_layer: Node2D
var gem_layer: Node2D
var fx_layer: Node2D
var enemies: Array = []
var bullets: Array = []
var gems: Array = []
var beams: Dictionary = {}
var echoes: Array = []
var kills := 0
var spawn_t := 0.0
var pending_levels := 0
var beam_lines: Dictionary = {}
var ground_node: Sprite2D
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	I = self
	rng.randomize()
	# ground: one repeating texture
	ground_node = Sprite2D.new()
	ground_node.texture = SpriteLib.ground_tex()
	ground_node.region_enabled = true
	ground_node.region_rect = Rect2(0, 0, 6000, 6000)
	ground_node.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	ground_node.z_index = -10
	add_child(ground_node)
	# layers
	bullet_layer = Node2D.new(); add_child(bullet_layer)
	gem_layer = Node2D.new(); add_child(gem_layer)
	fx_layer = Node2D.new(); add_child(fx_layer)
	# boundary walls
	for i in range(30):
		for edge in 4:
			var w := Vector2.ZERO
			match edge:
				0: w = Vector2(-half + 40 + i * 104.0, -half + 30)
				1: w = Vector2(-half + 40 + i * 104.0, half - 30)
				2: w = Vector2(-half + 30, -half + 40 + i * 104.0)
				3: w = Vector2(half - 30, -half + 40 + i * 104.0)
			var s := SpriteLib.sprite("wall%d" % (i % 3), 0.9)
			s.position = w
			add_child(s)
	# player + camera
	player = Player.new()
	player.game = self
	add_child(player)
	cam = Camera2D.new()
	cam.zoom = Vector2(1.4, 1.4)
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 8.0
	add_child(cam)
	cam.make_current()
	player.position = Vector2.ZERO
	hud = HUD.new()
	add_child(hud)
	hud.banner("THE COLLAPSED CITY")
	# screenshot mode for CI-style verification
	var shot := OS.get_environment("EB_SHOT")
	if shot != "":
		for i in 10:
			var a2 := TAU * i / 10.0
			spawn_enemy("husk", player.position + Vector2.from_angle(a2) * rng.randf_range(220.0, 420.0))
		spawn_enemy("lancer", player.position + Vector2(-320, -180))
		var t := get_tree().create_timer(3.0)
		t.timeout.connect(func() -> void:
			var img := get_viewport().get_texture().get_image()
			img.save_png(shot)
			get_tree().quit()
		)

func _physics_process(dt: float) -> void:
	if not player.alive:
		return
	elapsed += dt
	# camera follow with slight aim lead
	cam.position = player.position + Vector2.from_angle(player.rotation + (player.gun.rotation)) * 20.0
	# director: budget spawns
	spawn_t -= dt
	if spawn_t <= 0.0:
		spawn_t = maxf(0.35, 1.1 - elapsed * 0.008)
		if enemies.size() < 60:
			_spawn_wave()
	# echo cadence — record → replay, the signature loop
	if recorder.full():
		spawn_echo(recorder.harvest())
	# gems magnet
	for g in gems.duplicate():
		if not is_instance_valid(g["node"]):
			gems.erase(g)
			continue
		var d: float = g["node"].position.distance_to(player.position)
		if d < player.magnet:
			g["node"].position = g["node"].position.lerp(player.position, 10.0 * dt)
		if d < 22.0:
			player.add_xp(g["v"])
			g["node"].queue_free()
			gems.erase(g)
	hud.update_hud(player, elapsed, kills, echoes.size())
	# level-up cards
	if pending_levels > 0 and not get_tree().paused:
		pending_levels -= 1
		hud.show_choices(_roll_upgrades(), self)

func _spawn_wave() -> void:
	var min_e: float = elapsed / 60.0
	var pool: Array = ["husk"]
	if min_e > 1.2: pool.append("lancer")
	if min_e > 2.5: pool.append("thief")
	if min_e > 3.5: pool.append("mourner")
	var type: String = pool[rng.randi_range(0, pool.size() - 1)]
	var a := rng.randf_range(0.0, TAU)
	var d: float = (get_viewport_rect().size.length() / cam.zoom.x) * 0.62 + 120.0
	var pos: Vector2 = player.position + Vector2.from_angle(a) * d
	pos.x = clampf(pos.x, -half, half)
	pos.y = clampf(pos.y, -half, half)
	spawn_enemy(type, pos)

func spawn_enemy(type: String, pos: Vector2) -> void:
	var e := Enemy.new()
	e.setup(self, type, pos, 1.0 + elapsed / 60.0 * 0.4)
	add_child(e)
	enemies.append(e)

func spawn_echo(frames: Array) -> void:
	var e := Echo.new()
	e.setup(self, frames, player.weapon, player.echo_mul)
	e.position = Vector2(frames[0]["x"], frames[0]["y"])
	add_child(e)
	echoes.append(e)
	hud.banner("YOUR PAST JOINS THE FIGHT")
	# cap: oldest fades when over 3
	var live := echoes.filter(func(x): return not x.dead)
	if live.size() > 3:
		live[0].dead = true
		live[0].queue_free()
		echoes.erase(live[0])

func on_echo_expired(e) -> void:
	echoes.erase(e)

func enemy_shoot(pos: Vector2, target: Vector2, dmg: float) -> void:
	var p := Projectile.new()
	var ang := (target - pos).angle()
	p.setup(self, pos, Vector2.from_angle(ang) * 320.0, dmg * 0.7, false, 0.0, "orb", 1.0, false)
	p.team = 1
	bullet_layer.add_child(p)

func erase_bullet(b) -> void:
	bullets.erase(b)
	if is_instance_valid(b):
		b.queue_free()

func on_enemy_dead(e) -> void:
	kills += 1
	# gems
	var n := maxi(1, mini(6, e.xp))
	for i in n:
		var s := SpriteLib.sprite("shard", 0.5, 1.0)
		s.position = e.position + Vector2(rng.randf_range(-14, 14), rng.randf_range(-14, 14))
		gem_layer.add_child(s)
		gems.append({"node": s, "v": maxf(1.0, e.xp / float(n))})
	enemies.erase(e)

func explode(pos: Vector2, radius: float, dmg: float) -> void:
	fx_ring(pos, radius, "#ffb454")
	for e in enemies.duplicate():
		if not e.dead and e.position.distance_to(pos) < radius:
			e.hurt(dmg, false, (e.position - pos).normalized() * 200.0)

func fx_flash(pos: Vector2, rot: float, size: float) -> void:
	var s := SpriteLib.sprite("muzzle", 0.5, size)
	s.position = pos
	s.rotation = rot
	s.modulate = Color(1.0, 0.95, 0.8)
	fx_layer.add_child(s)
	var tw := s.create_tween()
	tw.tween_interval(0.05)
	tw.tween_property(s, "modulate:a", 0.0, 0.06)
	tw.tween_callback(s.queue_free)

func fx_ring(pos: Vector2, radius: float, col: String) -> void:
	var s := SpriteLib.sprite("ring", 0.5, radius * 2.0 / 190.0)
	s.position = pos
	s.modulate = Color(col)
	fx_layer.add_child(s)
	var tw := s.create_tween()
	tw.tween_property(s, "modulate:a", 0.0, 0.3)
	tw.tween_callback(s.queue_free)

func enemy_death(pos: Vector2, col: String, big: bool, is_echo: bool) -> void:
	var p := CPUParticles2D.new()
	p.position = pos
	p.amount = 14 if big else 8
	p.lifetime = 0.5
	p.one_shot = true
	p.explosiveness = 1.0
	p.direction = Vector2.UP
	p.spread = 180.0
	p.initial_velocity_min = 80.0
	p.initial_velocity_max = 260.0
	p.gravity = Vector2(0, 500)
	p.scale_amount_min = 2.0
	p.scale_amount_max = 4.0
	p.color = Color(col)
	fx_layer.add_child(p)
	p.emitting = true
	get_tree().create_timer(1.0).timeout.connect(p.queue_free)

func set_beam(from: Vector2, offset: Vector2, w: float, is_echo: bool) -> void:
	var key := "p" if not is_echo else "e"
	var l: Line2D = beam_lines.get(key)
	if l == null:
		l = Line2D.new()
		l.width = w
		l.default_color = Color(1.0, 0.93, 0.7, 0.85) if not is_echo else Color(0.6, 0.9, 1.0, 0.85)
		add_child(l)
		beam_lines[key] = l
	l.points = [from, from + offset]
	l.width = w
	beam_ttl[key] = 0.06
var beam_ttl := {}

func on_player_dead() -> void:
	hud.banner("MEMORY SEVERED")
	get_tree().create_timer(2.0).timeout.connect(func() -> void: get_tree().reload_current_scene())

func queue_level_up() -> void:
	pending_levels += 1

func _roll_upgrades() -> Array:
	var pool := Upgrades.DB.duplicate()
	pool.shuffle()
	return pool.slice(0, 3)

func apply_upgrade(u: Dictionary) -> void:
	var p := player
	match u["id"]:
		"dmg1": p.dmg_mul += 0.25
		"rate1": p.cd_mul *= 0.8
		"twin":
			p.extra_shots += 1
			p.dmg_mul *= 0.85
		"speed1": p.move_mul *= 1.18
		"crit1": p.crit += 0.15
		"echo_dmg": p.echo_mul += 0.3
		"echo_fast":
			p.echo_period = 7.0
			recorder.max_frames = 420
		"killboom": p.kill_explode = true
		"magnet": p.magnet *= 1.6
		"hp1":
			p.max_hp += 25.0
			p.hp = minf(p.hp + 25.0, p.max_hp)
	hud.banner(u["name"])
