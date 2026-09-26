class_name ActionRecorder
## THE ECHO SYSTEM, input half: records timestamped player actions each physics tick.
## Echo playback consumes exactly what this records — same data, no special-casing.

var frames: Array = []      # {x, y, aim, fire, b}
var max_frames: int = 600   # 10s @ 60Hz
var count := 0

func push(x: float, y: float, aim: float, fired: int, beam: bool) -> void:
	frames.append({"x": x, "y": y, "aim": aim, "f": fired, "b": beam})
	while frames.size() > max_frames:
		frames.pop_front()
	count += 1

func full() -> bool:
	return count > 0 and count % max_frames == 0

func harvest() -> Array:
	var copy := frames.duplicate(true)
	count = 0
	return copy
