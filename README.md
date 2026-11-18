# Northridge After Dark

A stealth game set in the abandoned Northridge College football stadium. Sneak in at night, get past cameras and guards across the stadium's three sections, find the field keycard and a bag of footballs, get down to the field, and kick a field goal.

Every night is different: which gates and doors are unlocked, where the keycard and footballs are, which cameras are live, the guard routes, where you start, and where you kick from.

## Play

Open `index.html` in a browser (the 3D version). It loads three.js r128 from cdnjs.

`topdown.html` is the original top-down 2D version. It has no dependencies.

| Key | Action |
| --- | --- |
| WASD | Move (relative to the camera) |
| Mouse / drag | Look around, wheel zooms |
| Left / Right arrows | Turn the camera |
| Space | Jump |
| C | Sneak: slow, silent, harder to see |
| Shift | Sprint: fast and loud |
| E | Try doors, flip the camera breaker, line up and take the kick |
| P | Pause · M mute |

On touch screens, the left half of the screen moves, the right half looks around, and on-screen buttons handle sneak, sprint, jump and use.

## How it works

- **Stadium:** a sunken bowl. The plaza and concourse are at ground level and the field is 8 m below. Rows of seats step down to the field, and you walk the aisles to get there. The field gates and the players' tunnel need the keycard.
- **Physics:** the player has gravity, jumping and step-up/step-down on stairs, and collides with walls. The football flies with gravity, air drag and wind, bounces off the turf, and can ricochet off the uprights, crossbar and gooseneck.
- **Stealth:** guards patrol, hear footsteps, investigate noises and chase you. Cameras sweep and trigger an alarm. Darkness and sneaking shrink how far they can see you.

## Development

`index.html` is generated. `tools/assemble.py` takes the game logic from `topdown.html` and splices in the 3D engine (`tools/three_part.js`), the player physics (`tools/player_part.js`) and the ball physics (`tools/kick_part.js`).

```bash
python3 tools/assemble.py
```

`tools/verify.js` is the automated check. It runs in headless Chromium and covers 30 random nights being solvable, ball physics (good kick, short, wide left and right, hitting the post, wind drift, drag), stair walking, jump height and airtime, wall collision, and a full kick through the real UI ending on the win screen. It needs `playwright` and `three@0.128.0` installed next to it.
