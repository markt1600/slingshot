# Park environment

File: `park.png`
Generated using the built-in image_gen tool for this project. No external image downloads or runtime services are used.

Final prompt:

> Use case: photorealistic-natural. Asset type: background plate for a side-view amusement-park slingshot physics game. Create a photorealistic 16:9 landscape, 1920x1080 or similar, with natural photographic materials and late afternoon warm side light. Composition is critical: upper 75 percent almost entirely open pale blue sky with delicate cirrus clouds; low horizon at 83 percent of image height. Distant wooded hills, real Ferris wheel on far left and roller coaster far right, small park pavilions and trees confined to bottom 20 percent. Bottom 4 percent a level concrete/gravel foreground running perfectly horizontally edge to edge. Keep the entire center foreground clear for a separately rendered ride. Slight atmospheric haze, realistic foliage detail, weathered structures, sophisticated muted blue green amber color grading, telephoto side elevation camera. No main slingshot tower, no cables, no passenger capsule, no close people, no words, no lettering, no watermark, no UI. This is a convincing photographic environment, absolutely not vector art, illustration, cartoon, low poly or painted.

## Object and character sprites

All three assets below were created using the built-in image_gen tool. Original alpha channels are preserved. The game crops and layers them at runtime; procedural rendering is the fallback. No injury imagery was generated: injury states and effects are rendered in Canvas.

### ambulance.png

Final prompt:

> Use case: product-mockup. Asset type: photorealistic transparent-background game sprite. One real European long-wheelbase ambulance van, exact flat left-facing side elevation profile, front at left, no perspective angle, all of vehicle and tires fully visible, centered with 5 percent transparent margin. Actual photographic realism: white automotive paint with subtle grime on lower rocker panels, red reflective stripe, realistic panel seams, black rubber tires, metallic wheel hubs, dark tinted glass, compact blue LED lightbar turned OFF. Side text exactly AMBULANCE. No people outside vehicle, no ground plane, no cast shadow outside vehicle, no environment. True transparent alpha background. Vehicle nearly fills a wide landscape image. Late afternoon natural sunlight from upper left, neutral color temperature. Not a drawing, not a cartoon, not low poly. Render entire van with believable commercial van proportions, body about 2.7 times longer than tall.

### capsule.png

Final prompt:

> Use case: product-mockup. Asset type: isolated photorealistic transparent-background game sprite. A real amusement park slingshot passenger capsule steel cage, straight-on orthographic FRONT elevation, centered and complete with 5 percent transparent margin. Round spherical roll cage of polished stainless steel structural tubing, circular outer rim, smaller rear rim, two metal cable attachment clevises at left and right 9 and 3 o'clock. An open empty interior with NO SEATS and NO PEOPLE: the central area must be fully transparent so animated seats and people can be composited separately. A shallow curved dark brushed-metal footwell only at the bottom fifth with rivets and narrow amber safety stripe. Real manufacturing details, welds, scuffed steel, steel highlights illuminated by warm afternoon light from upper left. No glass bubble, no windows, no roof covering, no ground, no environment, no text, no shadow outside object. True alpha transparency all around and through cage. Photographic industrial product image, not illustration, not cartoon, not toy. Square output.

### riders.png

Final prompt:

> Use case: product-mockup. Asset type: realistic adult character sprite atlas for a physics game, transparent alpha. Four completely separate full-body adult people arranged in four equally spaced columns in a wide 16:9 frame, facing camera straight forward, standing upright, feet a little apart, arms relaxed slightly away from the torso (small A pose) so the outline of each arm is separate. All four exactly the same displayed height, heads near 8 percent of image height, shoe soles at 94 percent. Each person centered within their column, no overlaps. Left to right: adult man with short brown hair, muted rust red T-shirt and charcoal trousers; adult woman with short dark hair, muted blue T-shirt and dark gray trousers; adult man with sandy short hair, muted green T-shirt and olive-gray trousers; adult woman with auburn hair tied back, muted purple T-shirt and navy trousers. Plain practical dark sneakers. Photographic realism, natural adult anatomy, realistic faces and skin, fine cotton fabric and seams, warm soft sunlight from upper left. No props, no text, no labels, no environment, no shadows outside people. Genuine transparent alpha background between and around all figures. Consistent orthographic front view, no perspective, no cartoon, no illustration, no plastic dolls. Full heads and feet visible. Neutral expressions. No injury or gore.


## park-animated.png

Created with the built-in image_gen editing tool using `park.png` as the edit target. The original is preserved. This removes the baked-in wheel so that the code-rendered animated wheel does not overlap a stationary duplicate.

Final prompt:

> Edit target: the supplied amusement park background image. Remove ONLY the Ferris wheel at the lower left, including its rim, spokes, gondolas, and support legs. Reconstruct the small area behind it with matching distant hills, treetops and pale sky. Preserve every other element unchanged, especially the roller coaster on the right, tree positions, horizon, pavilions, lighting, clouds, foreground, dimensions and composition. Do not add any objects or text. This is a clean photographic background plate on which an animated wheel will be composited.
