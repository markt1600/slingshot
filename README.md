# Mega Slingshot — rebuilt ride

A substantial visual and simulation upgrade to the original Carnival of Questionable Safety. The core game remains: choose a tower and riders, set rope strength and accident chance, grab the pod, pull either way, and release. Seatbelts, parachutes, cord failures, injuries, spectators, balloons, and the rescue sequence remain part of the game.

## Play

Open `index.html` directly in a modern browser. No installation, network connection, build step, or API keys are required. Keep `game.js`, `style.css`, and `assets/` beside the HTML file.

Alternatively run `python3 -m http.server 8080` in this folder and open http://localhost:8080.

- Drag the capsule and release to launch.
- Tab to the scene, use arrow keys to aim, and Enter to launch.
- Space pauses/resumes, and R resets, when focus is outside a form control.
- Choose real time, slow motion, or the original 3× arcade pace.
- The dotted aiming arc predicts the next two seconds assuming intact cords. Accidents and impacts can change the actual path.

## Improvements

Latest visual pass:

- Twenty additional spectators stroll along the midway and pause to watch the ride. Cord failures, rider ejections, detached debris, hard capsule impacts, and bystander injuries send both the walkers and the original fourteen-person fence crowd running in panic. Spectators react at staggered times, change direction, and reset with each new ride; collisions follow their current positions.

- Once every rider has landed, an attached empty capsule returns in a bounded 1.4-second winch animation. A fully detached empty capsule finishes its remaining fall and ground settling at 4× speed. Rider motion and the rest of the simulation remain at the selected playback speed.

- Real elapsed time is preserved during slow frames instead of capped at 50 ms. Character textures are cached and side-panel rendering is limited to 10 Hz, reducing the load during busy rides.
- Standing, boarding, seated, and falling people share one readable scene scale. Unrestrained falling riders use quadratic aerodynamic drag instead of strong linear damping.

- Dimensional enamel-style title lettering, a slingshot emblem, and a framed midway sign treatment that adapts to mobile.
- Nine-cell parachutes inflate progressively, bank in the wind, and ripple along the trailing edge. Suspension lines stay connected to the rider, and landed canopies collapse onto the ground.

- Polished setup labels, action prompts, incident warnings, rider reports, and results. Event chips are capped and deduplicated to reduce visual noise; ride status changes are announced politely to screen readers.

- A 24-cabin Ferris wheel turns once every 110 simulation seconds; cabins remain upright, support legs stay fixed, and the base is partially hidden by trees.
- A five-car coaster train follows the photographed upper rail. Each car rotates with the track slope, climbs slowly, and accelerates over the hills before returning out of view.
- Balloons use a tapered latex silhouette, soft sky reflections, warm edge lighting, tied necks, and flexible strings. Their collision centers and popping behavior are preserved.

- Four distinct photographic-style adult riders with animated arm and leg layers; clothing, faces, and skin remain visible in the condition panel.
- A photographed steel capsule cage with dynamic seats and harnesses, and a realistic ambulance sprite with moving wheel highlights, flashing lights, and readable markings in both travel directions.
- Smaller directional blood droplets, irregular ground stains that darken with age, shaded detached parts, and localized injury marks, replacing the original bright circular effects.
- Actual cloud imagery drifts across the sky. Five isolated foliage regions sway with an irregular gust cycle, while ride structures and terrain remain stationary. Environment animation respects reduced-motion preferences and freezes with the simulation pause.
- Procedural fallbacks keep the ride visible if a sprite fails to load. Assets require no external services.


- Locally bundled photographic-style park environment generated with the built-in image generation tool; layered steel lattice towers, braided cords, reflective capsule, natural rider silhouettes, and restrained lighting.
- A 240 Hz fixed simulation step for physics, riders, collisions, and accident timing, independent of display refresh rate. Background tabs do not accumulate catch-up time.
- Tension-only elastic cords with velocity-dependent damping and mild strain hardening. Slack cords cannot push the capsule.
- Ground restitution, friction impulses, and a low-speed rest threshold reduce endless micro-bounces.
- Rider/pod collision impulses conserve linear momentum using actual masses. Collision radii no longer depend on visual enlargement of the capsule.
- Ejected riders inherit current pod velocity; pod mass decreases when a rider leaves. The camera stays at its setup scale throughout the ride, preventing the foreground from shrinking against a fixed background. Extreme trajectories can leave the viewport; telemetry continues to track the capsule.
- Parachutes inflate over 0.85 seconds and apply quadratic drag toward a roughly 5.5 m/s descent, replacing the old 15 m/s speed limiter.
- New live speed, altitude, peak altitude, pause, playback speed, aiming preview, keyboard controls, and responsive layout.
- Pointer cancellation safely resets the pull. Configuration controls are disabled during a ride, including for keyboard input.
- Separate HTML, CSS, and JavaScript files; no runtime third-party libraries.

This remains a 2D arcade game with deliberately exaggerated accident and injury rules, not an engineering ride-safety model. The scenery, four riders, ambulance, and capsule use locally bundled photographic-style images, combined with articulated Canvas layers, harnesses, vehicle lights, wheels, and injury effects. This is a 2D sprite renderer rather than a 3D model renderer. The background image is decorative; the foreground ride, riders, balloons, particles, and telemetry are simulated.

## Tests

Install development tooling with `npm install`, then `npx playwright install chromium` and `npm test`. You can instead set `CHROME_PATH` to an installed Chrome executable. `npm run check` checks JavaScript syntax.

The browser suite covers 16 complete rides across 20–200 m tower heights, one/four riders and two pull strengths; four forced double-snap scenarios; cord damping/slack behavior; collision momentum; parachute touchdown; ejection mass/velocity; pointer cancellation; actual mouse and keyboard launches; and mobile overflow. It fails on browser JavaScript errors. Screenshots are written to ignored `test-results/`.

Verified in headless Chrome on desktop and at a 390 px mobile viewport. Other browser engines and physical touch devices have not been tested.

## Files

- `index.html` — game controls and layout
- `style.css` — visual design and responsive rules
- `game.js` — simulation, rendering, and audio
- `assets/park-animated.png` — environment plate with the static Ferris wheel removed
- `assets/park.png` — original environment reference
- `assets/PROVENANCE.md` — generation method and full image prompt
- `tests/browser.cjs` — regression suite
- `tests/rendering.cjs` — sprite/material inspection, all injury states, and cloud/tree motion checks
