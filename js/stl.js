/**
 * PCB at Home - STL Generation (JSCAD CSG)
 *
 * Uses @jscad/modeling boolean ops instead of hand-written triangulation.
 * Global `jscadBundle` is loaded via jscad-modeling.min.js.
 */
var PCB = PCB || {};

PCB.STL = (function () {
    var Geo = PCB.Geometry;

    // JSCAD shortcuts (resolved once at module init)
    var modeling = jscadBundle.jscadModeling;
    var serializer = jscadBundle.stlSerializer;

    var polygon = modeling.primitives.polygon;
    var circle = modeling.primitives.circle;
    var rectangle = modeling.primitives.rectangle;
    var cylinder = modeling.primitives.cylinder;
    var extrudeLinear = modeling.extrusions.extrudeLinear;
    var translate = modeling.transforms.translate;
    var hull = modeling.hulls.hull;
    var rotate = modeling.transforms.rotate;
    var union = modeling.booleans.union;
    var subtract = modeling.booleans.subtract;
    var intersect = modeling.booleans.intersect;

    /**
     * Validate that boundary lines form a closed polygon.
     * Returns the polygon points array or null with error message.
     */
    function validateOutline(elements) {
        var boundaries = elements.filter(function (e) { return e.type === 'boundary'; });
        if (boundaries.length < 3) {
            return { error: PCB.I18n.t('errNeedBoundary') };
        }

        var segments = boundaries.map(function (b) {
            return { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
        });

        var poly = Geo.buildPolygonFromSegments(segments);
        if (!poly) {
            return { error: PCB.I18n.t('errNotClosed') };
        }

        return { polygon: poly };
    }

    /**
     * Validate that all circuits and vias are within the outline polygon.
     */
    function validateElementsInBounds(elements, poly) {
        var errors = [];
        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            if (elem.type === 'circuit') {
                if (!Geo.pointInPolygon({ x: elem.x1, y: elem.y1 }, poly)) {
                    errors.push('Circuit line endpoint 1 at (' + elem.x1 + ',' + elem.y1 + ') ' + PCB.I18n.t('errOutside'));
                }
                if (!Geo.pointInPolygon({ x: elem.x2, y: elem.y2 }, poly)) {
                    errors.push('Circuit line endpoint 2 at (' + elem.x2 + ',' + elem.y2 + ') ' + PCB.I18n.t('errOutside'));
                }
            } else if (elem.type === 'via') {
                if (!Geo.pointInPolygon({ x: elem.cx, y: elem.cy }, poly)) {
                    errors.push('Via center at (' + elem.cx + ',' + elem.cy + ') ' + PCB.I18n.t('errOutside'));
                }
            }
        }
        return errors;
    }

    /**
     * Convert grid coordinates to mm.
     */
    function gridToMm(val) {
        return val * PCB.Config.GRID_UNIT;
    }

    /**
     * Generate 45° V-groove solids on top and bottom faces of the PCB.
     * Returns a single JSCAD solid (union of all groove prisms).
     *
     * Approach:
     *   1. Build a 2D triangular cross-section in XY plane
     *   2. Extrude along Z to create a prism of length `diag`
     *   3. Center along Z, then rotate 90° around X to lay along Y axis
     *   4. Rotate 45° around Z for diagonal orientation
     *   5. Translate each groove: center of bounding box + perpendicular offset + face Z
     *
     * Rotation analysis — rotate([π/2, 0, 0]) maps:
     *   (x, y, z) → (x, −z, y)
     *   So: original Y becomes final Z, original Z becomes final −Y (prism length along −Y).
     *
     * Top face: groove cuts downward from z=thickness into board.
     *   Need apex at z = −grooveDepth relative to face → original y = −grooveDepth.
     *   Triangle CCW with apex below X axis: [(−halfW,0), (0,−depth), (halfW,0)]
     *
     * Bottom face: groove cuts upward from z=0 into board.
     *   Need apex at z = +grooveDepth relative to face → original y = +grooveDepth.
     *   Triangle CCW with apex above X axis: [(halfW,0), (0,+depth), (−halfW,0)]
     */
    function generateGrooves(outerPts, thickness, grooveWidth, grooveDepth, grooveSpacing) {
        // 1. Bounding box from outerPts ([[x,y], ...] in mm)
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < outerPts.length; i++) {
            var px = outerPts[i][0], py = outerPts[i][1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }

        // 2. Diagonal length (+ margin) and center
        var dx = maxX - minX, dy = maxY - minY;
        var diag = Math.sqrt(dx * dx + dy * dy) + 4;
        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;

        var halfW = grooveWidth / 2;
        var pitch = grooveWidth + grooveSpacing;

        // 3. Build the two triangle cross-sections (CCW winding required by JSCAD)
        // Top face: apex at y = -grooveDepth (maps to z = -grooveDepth after X-rot)
        // CCW for apex-below triangle: left → apex → right
        var topTriPoly = polygon({ points: [
            [-halfW, 0],
            [0, -grooveDepth],
            [halfW, 0]
        ] });
        // Bottom face: apex at y = +grooveDepth (maps to z = +grooveDepth after X-rot)
        // CCW for apex-above triangle: right → apex → left
        var botTriPoly = polygon({ points: [
            [halfW, 0],
            [0, grooveDepth],
            [-halfW, 0]
        ] });

        // 4. Perpendicular direction to groove line
        // After Rx(π/2) + Rz(π/4), groove runs along (-√2/2, √2/2).
        // Perpendicular to that is (√2/2, √2/2).
        var sin45 = Math.sin(Math.PI / 4);
        var cos45 = Math.cos(Math.PI / 4);
        var perpX = cos45;
        var perpY = sin45;

        var nHalf = Math.ceil(diag / pitch);
        var grooves = [];

        for (var n = -nHalf; n <= nHalf; n++) {
            var d = n * pitch;

            // Top face groove
            var topPrism = extrudeLinear({ height: diag }, topTriPoly);
            topPrism = translate([0, 0, -diag / 2], topPrism);      // center along Z
            topPrism = rotate([Math.PI / 2, 0, 0], topPrism);        // lay along -Y
            topPrism = rotate([0, 0, Math.PI / 4], topPrism);        // 45° diagonal
            topPrism = translate([cx + perpX * d, cy + perpY * d, thickness], topPrism);
            grooves.push(topPrism);

            // Bottom face groove (-45°, cross-hatch with top for strength)
            // Groove direction after Rz(-π/4): (√2/2, √2/2), perp: (-√2/2, √2/2)
            var botPrism = extrudeLinear({ height: diag }, botTriPoly);
            botPrism = translate([0, 0, -diag / 2], botPrism);
            botPrism = rotate([Math.PI / 2, 0, 0], botPrism);
            botPrism = rotate([0, 0, -Math.PI / 4], botPrism);
            botPrism = translate([cx + (-sin45) * d, cy + cos45 * d, 0], botPrism);
            grooves.push(botPrism);
        }

        if (grooves.length === 0) return null;
        if (grooves.length === 1) return grooves[0];
        return union.apply(null, grooves);
    }

    /**
     * Main export function.
     * Returns { buffer: ArrayBuffer } on success, or { error: string } on failure.
     */
    function exportSTL(elements, opts) {
        opts = opts || {};
        var enableGrooves = opts.enableGrooves !== false;
        var pcbThickness = opts.pcbThickness || PCB.Config.DEFAULT_THICKNESS;
        // 1. Validate outline
        var outlineResult = validateOutline(elements);
        if (outlineResult.error) {
            return { error: outlineResult.error };
        }
        var outlinePoly = outlineResult.polygon;

        // 2. Validate elements in bounds
        var boundErrors = validateElementsInBounds(elements, outlinePoly);
        if (boundErrors.length > 0) {
            return { error: boundErrors.join('\n') };
        }

        // 3. Build 3D geometry with JSCAD CSG
        var gu = PCB.Config.GRID_UNIT;
        var grooveDepth = opts.grooveDepth || PCB.Config.DEFAULT_GROOVE_DEPTH;
        var baseTraceHeight = opts.traceHeight || PCB.Config.TRACE_HEIGHT;
        var traceHeight = Math.max(baseTraceHeight, enableGrooves ? grooveDepth : 0);
        var thickness = pcbThickness;

        // --- 3a. PCB base solid (extruded outline) ---
        // Negate Y to convert from canvas (Y-down) to STL (Y-up).
        // This reverses winding, so reverse the array to restore CCW.
        var outerPts = Geo.ensureCCW(outlinePoly).map(function (p) {
            return [p.x * gu, -p.y * gu];
        });
        outerPts.reverse();
        var basePoly = polygon({ points: outerPts });
        var baseSolid = extrudeLinear({ height: thickness }, basePoly);

        // Border frame: 2mm wide strips along boundary edges
        var boundaries = elements.filter(function (e) { return e.type === 'boundary'; });
        var borderSolids = [];
        for (var i = 0; i < boundaries.length; i++) {
            var b = boundaries[i];
            var x1 = b.x1 * gu, y1 = -b.y1 * gu;
            var x2 = b.x2 * gu, y2 = -b.y2 * gu;

            // 2mm wide strip along edge + 2mm squares at endpoints
            var sq1 = rectangle({ size: [2, 2], center: [x1, y1] });
            var sq2 = rectangle({ size: [2, 2], center: [x2, y2] });
            var strip = hull(sq1, sq2);
            borderSolids.push(extrudeLinear({ height: thickness }, strip));
        }
        var borderFrame = borderSolids.length > 0 ? union.apply(null, borderSolids) : null;

        // --- 3b. Circuit traces (embedded into base, flush with surface) ---
        var traceGap = opts.traceGap || PCB.Config.DEFAULT_TRACE_GAP;
        var traceFence = opts.traceFence || PCB.Config.DEFAULT_TRACE_FENCE;
        var traceGapExtra = traceGap * 2;
        var traceFenceExtra = (traceGap + traceFence) * 2;
        // Build three sets: original width, +gap, +gap+fence
        var circuits = elements.filter(function (e) { return e.type === 'circuit'; });

        function buildTraceSolids(widthExtra) {
            var solids = [];
            for (var i = 0; i < circuits.length; i++) {
                var c = circuits[i];
                var x1mm = c.x1 * gu;
                var y1mm = -c.y1 * gu;
                var x2mm = c.x2 * gu;
                var y2mm = -c.y2 * gu;

                var r = (c.width + widthExtra) / 2;
                var cap1 = circle({ radius: r, segments: 32, center: [x1mm, y1mm] });
                var cap2 = circle({ radius: r, segments: 32, center: [x2mm, y2mm] });
                var traceProfile = hull(cap1, cap2);
                var traceExtruded = extrudeLinear({ height: traceHeight }, traceProfile);

                var zBase;
                if (c.side === PCB.Config.SIDE_FRONT) {
                    zBase = thickness - traceHeight;
                } else {
                    zBase = 0;
                }
                solids.push(translate([0, 0, zBase], traceExtruded));
            }
            return solids;
        }

        var traceSolids = buildTraceSolids(0);                  // original width
        var traceSolidsGap = buildTraceSolids(traceGapExtra);    // +gap
        var traceSolidsFence = buildTraceSolids(traceFenceExtra); // +gap+fence

        // --- 3c. Via geometry ---
        var vias = elements.filter(function (e) { return e.type === 'via'; });
        var viaPads = [];      // solid pads (diameter + 0.4mm), fill over grooves
        var viaCylinders = []; // drill holes (original diameter)
        for (var i = 0; i < vias.length; i++) {
            var v = vias[i];
            var vx = v.cx * gu;
            var vy = -v.cy * gu;

            // Pad cylinder: flush with base, fills grooves around via
            var pad = cylinder({
                radius: (v.diameter + 0.4) / 2,
                height: thickness,
                segments: 32
            });
            viaPads.push(translate([vx, vy, thickness / 2], pad));

            // Drill hole cylinder
            var cyl = cylinder({
                radius: v.diameter / 2,
                height: thickness + 2,
                segments: 32
            });
            viaCylinders.push(translate([vx, vy, thickness / 2], cyl));
        }

        // --- 3d. Boolean operations ---
        // Order: base → subtract grooves → union border (intersect with base) → union via pads → stepped traces → subtract via holes
        var result = baseSolid;
        if (enableGrooves) {
            var gw = opts.grooveWidth || PCB.Config.DEFAULT_GROOVE_WIDTH;
            var gs = opts.grooveSpacing || PCB.Config.DEFAULT_GROOVE_SPACING;
            var grooves = generateGrooves(outerPts, thickness, gw, grooveDepth, gs);
            if (grooves) {
                result = subtract(result, grooves);
            }
        }
        if (borderFrame) {
            result = union(result, borderFrame);
            result = intersect(result, baseSolid);
        }
        if (viaPads.length > 0) {
            result = union(result, union.apply(null, viaPads));
        }
        if (circuits.length > 0) {
            result = union(result, union.apply(null, traceSolidsFence));
            result = subtract(result, union.apply(null, traceSolidsGap));
            result = union(result, union.apply(null, traceSolids));
        }
        if (viaCylinders.length > 0) {
            result = subtract(result, union.apply(null, viaCylinders));
        }

        // 4. Serialize to binary STL
        var rawData = serializer.serialize({ binary: true }, result);

        // rawData is an array of ArrayBuffers/Uint8Arrays; merge into one ArrayBuffer
        var totalLen = 0;
        for (var i = 0; i < rawData.length; i++) {
            totalLen += rawData[i].byteLength || rawData[i].length;
        }
        var merged = new Uint8Array(totalLen);
        var offset = 0;
        for (var i = 0; i < rawData.length; i++) {
            var chunk = rawData[i] instanceof Uint8Array ? rawData[i] : new Uint8Array(rawData[i]);
            merged.set(chunk, offset);
            offset += chunk.length;
        }

        // Read triangle count from binary STL header (offset 80, uint32 LE)
        var triangleCount = new DataView(merged.buffer).getUint32(80, true);

        return { buffer: merged.buffer, triangleCount: triangleCount };
    }

    return {
        validateOutline: validateOutline,
        validateElementsInBounds: validateElementsInBounds,
        exportSTL: exportSTL
    };
})();
